import { describe, expect, it, vi } from 'vitest';

import { TranslationQueueService } from '../src/translation-jobs/translation-queue.service.js';

function createService() {
  const config = {
    get: vi.fn(),
  } as any;

  const executor = {
    execute: vi.fn(),
  } as any;

  const jobs = {
    resume: vi.fn(),
  } as any;

  const service = new TranslationQueueService(config, executor, jobs);

  return {
    service,
    executor,
    jobs,
  };
}

describe('TranslationQueueService', () => {
  it('does not enqueue a duplicate active BullMQ job', async () => {
    const { service } = createService();
    const existing = {
      id: 'job-1',
      getState: vi.fn().mockResolvedValue('active'),
      remove: vi.fn(),
    };
    const queue = {
      getJob: vi.fn().mockResolvedValue(existing),
      add: vi.fn(),
    };

    (service as any).queue = queue;

    const result = await service.enqueue('job-1', 'shop-a.myshopify.com');

    expect(result).toMatchObject({
      enqueued: false,
      duplicate: true,
      state: 'active',
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('uses cooperative cancellation for an active worker job', async () => {
    const { service } = createService();
    const existing = {
      id: 'job-1',
      getState: vi.fn().mockResolvedValue('active'),
      remove: vi.fn(),
    };
    const queue = {
      getJob: vi.fn().mockResolvedValue(existing),
    };

    (service as any).queue = queue;

    const result = await service.cancel('job-1');

    expect(result).toMatchObject({
      removed: false,
      cooperative: true,
      state: 'active',
    });
    expect(existing.remove).not.toHaveBeenCalled();
  });

  it('recovers a stale PostgreSQL RUNNING state after BullMQ retries an interrupted job', async () => {
    const { service, executor, jobs } = createService();

    executor.execute
      .mockResolvedValueOnce({
        execution: {
          reason: 'ALREADY_RUNNING',
        },
      })
      .mockResolvedValueOnce({
        id: 'job-1',
        status: 'COMPLETED',
      });

    jobs.resume.mockResolvedValue({
      id: 'job-1',
      status: 'QUEUED',
    });

    const queueJob = {
      name: 'execute-translation-job',
      data: {
        jobId: 'job-1',
        shopifyDomain: 'shop-a.myshopify.com',
      },
      updateProgress: vi.fn(),
    };

    const result = await (service as any).processJob(queueJob);

    expect(jobs.resume).toHaveBeenCalledWith('shop-a.myshopify.com', 'job-1');
    expect(executor.execute).toHaveBeenCalledTimes(2);
    expect(queueJob.updateProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'recovered-stale-job',
      }),
    );
    expect(result).toMatchObject({ status: 'COMPLETED' });
  });
});
