import { describe, expect, it, vi } from 'vitest';

import { TranslationJobsController } from '../src/translation-jobs/translation-jobs.controller.js';

describe('TranslationJobsController queue metadata', () => {
  it('checks tenant ownership before returning BullMQ job status', async () => {
    const jobsService = {
      findOne: vi.fn().mockResolvedValue({ id: 'job-1' }),
    } as any;

    const queueService = {
      jobStatus: vi.fn().mockResolvedValue({
        queueJobId: 'job-1',
        state: 'waiting',
      }),
    } as any;

    const controller = new TranslationJobsController(
      jobsService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      queueService,
    );

    const result = await controller.queueJobStatus(
      {
        shopDomain: 'shop-a.myshopify.com',
      } as any,
      'job-1',
    );

    expect(jobsService.findOne).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      'job-1',
    );
    expect(queueService.jobStatus).toHaveBeenCalledWith('job-1');
    expect(result).toMatchObject({ state: 'waiting' });
  });

  it('does not query BullMQ when the job does not belong to the authenticated shop', async () => {
    const ownershipError = new Error('Translation job not found.');
    const jobsService = {
      findOne: vi.fn().mockRejectedValue(ownershipError),
    } as any;
    const queueService = {
      jobStatus: vi.fn(),
    } as any;

    const controller = new TranslationJobsController(
      jobsService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      queueService,
    );

    await expect(
      controller.queueJobStatus(
        { shopDomain: 'shop-a.myshopify.com' } as any,
        'job-owned-by-b',
      ),
    ).rejects.toBe(ownershipError);

    expect(queueService.jobStatus).not.toHaveBeenCalled();
  });
});
