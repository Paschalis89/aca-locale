import {
  useState,
} from "react";

import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";

import {
  useAppBridge,
} from "@shopify/app-bridge-react";

import {
  boundary,
} from "@shopify/shopify-app-react-router/server";

import {
  authenticate,
} from "../shopify.server";

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  await authenticate.admin(
    request,
  );

  return null;
};

export default function Index() {
  const shopify =
    useAppBridge();

  const [
    jobId,
    setJobId,
  ] = useState("");

  const [
    itemId,
    setItemId,
  ] = useState("");

  const [
    lastResult,
    setLastResult,
  ] = useState<unknown>(
    null,
  );

  const callApi = async (
    url: string,
    options: RequestInit = {},
  ) => {
    const token =
      await shopify.idToken();

    const response =
      await fetch(
        url,
        {
          ...options,
          headers: {
            Authorization:
              `Bearer ${token}`,
            ...options.headers,
          },
        },
      );

    const responseText =
      await response.text();

    let data: any;

    try {
      data = responseText
        ? JSON.parse(
            responseText,
          )
        : {};
    } catch {
      data = {
        result:
          responseText,
      };
    }

    setLastResult(
      data,
    );

    if (!response.ok) {
      throw new Error(
        data.message ??
          `HTTP ${response.status}`,
      );
    }

    return data;
  };

  const requireJob = () => {
    if (!jobId) {
      shopify.toast.show(
        "Create or select a job first.",
        {
          isError:
            true,
        },
      );

      return false;
    }

    return true;
  };

  const requireIds = () => {
    if (
      !jobId ||
      !itemId
    ) {
      shopify.toast.show(
        "Create or regenerate a job first.",
        {
          isError:
            true,
        },
      );

      return false;
    }

    return true;
  };

  const syncCurrentIds = (
    data: any,
  ) => {
    if (data?.id) {
      setJobId(
        data.id,
      );
    }

    if (
      data?.items?.[0]?.id
    ) {
      setItemId(
        data.items[0].id,
      );
    }
  };

  const createJob = async () => {
    try {
      const data =
        await callApi(
          "/api/backend/translation-jobs",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                targetLocale:
                  "it",
                resourceTypes: [
                  "PRODUCT",
                ],
                maxItems:
                  10,
              }),
          },
        );

      syncCurrentIds(
        data,
      );

      shopify.toast.show(
        "Test job created",
      );
    } catch (error) {
      console.error(
        error,
      );

      shopify.toast.show(
        "Job creation failed",
        {
          isError:
            true,
        },
      );
    }
  };

  const executeJob = async () => {
    if (!requireJob()) {
      return;
    }

    try {
      const data =
        await callApi(
          `/api/backend/translation-jobs/${jobId}/execute`,
          {
            method:
              "POST",
          },
        );

      if (
        data?.items?.[0]?.id
      ) {
        setItemId(
          data.items[0].id,
        );
      }

      shopify.toast.show(
        data?.execution?.skipped
          ? "Execution skipped safely"
          : "Translation executed",
      );
    } catch (error) {
      console.error(
        error,
      );

      shopify.toast.show(
        "Execution failed",
        {
          isError:
            true,
        },
      );
    }
  };

  const cancelJob = async () => {
    if (!requireJob()) {
      return;
    }

    try {
      const data =
        await callApi(
          `/api/backend/translation-jobs/${jobId}/cancel`,
          {
            method:
              "POST",
          },
        );

      syncCurrentIds(
        data,
      );

      shopify.toast.show(
        "Job cancelled",
      );
    } catch (error) {
      console.error(
        error,
      );

      shopify.toast.show(
        "Cancel failed",
        {
          isError:
            true,
        },
      );
    }
  };

  const resumeJob = async () => {
    if (!requireJob()) {
      return;
    }

    try {
      const data =
        await callApi(
          `/api/backend/translation-jobs/${jobId}/resume`,
          {
            method:
              "POST",
          },
        );

      syncCurrentIds(
        data,
      );

      shopify.toast.show(
        "Job resumed",
      );
    } catch (error) {
      console.error(
        error,
      );

      shopify.toast.show(
        "Resume failed",
        {
          isError:
            true,
        },
      );
    }
  };

  const retryFailedJob = async () => {
    if (!requireJob()) {
      return;
    }

    try {
      const data =
        await callApi(
          `/api/backend/translation-jobs/${jobId}/retry-failed`,
          {
            method:
              "POST",
          },
        );

      syncCurrentIds(
        data,
      );

      shopify.toast.show(
        "Failed items requeued",
      );
    } catch (error) {
      console.error(
        error,
      );

      shopify.toast.show(
        "Retry failed",
        {
          isError:
            true,
        },
      );
    }
  };

  const reviewJob = async () => {
    if (!requireJob()) {
      return;
    }

    try {
      await callApi(
        `/api/backend/translation-jobs/${jobId}/review`,
        {
          method:
            "POST",
        },
      );

      shopify.toast.show(
        "AI review completed",
      );
    } catch (error) {
      console.error(
        error,
      );

      shopify.toast.show(
        "AI review failed",
        {
          isError:
            true,
        },
      );
    }
  };

  const approveAsIs = async () => {
    if (!requireIds()) {
      return;
    }

    try {
      await callApi(
        `/api/backend/translation-jobs/${jobId}/items/${itemId}/approve`,
        {
          method:
            "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify({
              note:
                "Approved as-is from ACA Locale development workflow.",
            }),
        },
      );

      shopify.toast.show(
        "Translation approved",
      );
    } catch (error) {
      console.error(
        error,
      );

      shopify.toast.show(
        "Approval failed",
        {
          isError:
            true,
        },
      );
    }
  };

  const editAndApprove = async () => {
    if (!requireIds()) {
      return;
    }

    const current =
      (lastResult as any)
        ?.items?.[0]
        ?.translatedValue ??
      (lastResult as any)
        ?.translatedValue ??
      "";

    const value =
      window.prompt(
        "Final approved translation:",
        current,
      );

    if (
      value ===
      null
    ) {
      return;
    }

    try {
      await callApi(
        `/api/backend/translation-jobs/${jobId}/items/${itemId}/approve`,
        {
          method:
            "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify({
              approvedValue:
                value,
              note:
                "Edited and approved by human reviewer.",
            }),
        },
      );

      shopify.toast.show(
        "Edited translation approved",
      );
    } catch (error) {
      console.error(
        error,
      );

      shopify.toast.show(
        "Edit + approval failed",
        {
          isError:
            true,
        },
      );
    }
  };

  const rejectItem = async () => {
    if (!requireIds()) {
      return;
    }

    const note =
      window.prompt(
        "Reason for rejection:",
        "Translation requires regeneration.",
      );

    if (!note) {
      return;
    }

    try {
      await callApi(
        `/api/backend/translation-jobs/${jobId}/items/${itemId}/reject`,
        {
          method:
            "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify({
              note,
            }),
        },
      );

      shopify.toast.show(
        "Translation rejected",
      );
    } catch (error) {
      console.error(
        error,
      );

      shopify.toast.show(
        "Rejection failed",
        {
          isError:
            true,
        },
      );
    }
  };

  const regenerateItem = async () => {
    if (!requireIds()) {
      return;
    }

    try {
      const data =
        await callApi(
          `/api/backend/translation-jobs/${jobId}/items/${itemId}/regenerate`,
          {
            method:
              "POST",
          },
        );

      syncCurrentIds(
        data,
      );

      shopify.toast.show(
        "Regeneration job created",
      );
    } catch (error) {
      console.error(
        error,
      );

      shopify.toast.show(
        "Regeneration failed",
        {
          isError:
            true,
        },
      );
    }
  };

  const publishItem = async () => {
    if (!requireIds()) {
      return;
    }

    try {
      const data =
        await callApi(
          `/api/shopify/translation-jobs/${jobId}/items/${itemId}/publish`,
          {
            method:
              "POST",
          },
        );

      shopify.toast.show(
        data.alreadyPublished
          ? "Translation already published"
          : "Translation published to Shopify",
      );
    } catch (error) {
      console.error(
        error,
      );

      shopify.toast.show(
        "Shopify publication failed",
        {
          isError:
            true,
        },
      );
    }
  };

  return (
    <s-page heading="ACA Locale – Translation Pipeline">
      <s-section heading="Development workflow">
        <s-stack
          direction="block"
          gap="base"
        >
          <s-paragraph>
            Current job:{" "}
            <strong>
              {jobId || "none"}
            </strong>
          </s-paragraph>

          <s-paragraph>
            Current item:{" "}
            <strong>
              {itemId || "none"}
            </strong>
          </s-paragraph>

          <s-stack
            direction="inline"
            gap="base"
          >
            <s-button
              onClick={
                createJob
              }
            >
              Create 1-item Job
            </s-button>

            <s-button
              onClick={
                executeJob
              }
            >
              Execute
            </s-button>

            <s-button
              onClick={
                reviewJob
              }
            >
              AI Review
            </s-button>
          </s-stack>

          <s-stack
            direction="inline"
            gap="base"
          >
            <s-button
              onClick={
                cancelJob
              }
            >
              Cancel Job
            </s-button>

            <s-button
              onClick={
                resumeJob
              }
            >
              Resume Job
            </s-button>

            <s-button
              onClick={
                retryFailedJob
              }
            >
              Retry Failed
            </s-button>
          </s-stack>

          <s-stack
            direction="inline"
            gap="base"
          >
            <s-button
              onClick={
                approveAsIs
              }
            >
              Approve As-Is
            </s-button>

            <s-button
              onClick={
                editAndApprove
              }
            >
              Edit + Approve
            </s-button>

            <s-button
              onClick={
                rejectItem
              }
            >
              Reject
            </s-button>

            <s-button
              onClick={
                regenerateItem
              }
            >
              Regenerate
            </s-button>

            <s-button
              onClick={
                publishItem
              }
            >
              Publish to Shopify
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Last API response">
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
        >
          <pre
            style={{
              margin:
                0,
              whiteSpace:
                "pre-wrap",
              wordBreak:
                "break-word",
            }}
          >
            {lastResult
              ? JSON.stringify(
                  lastResult,
                  null,
                  2,
                )
              : "No request executed yet."}
          </pre>
        </s-box>
      </s-section>
    </s-page>
  );
}

export const headers:
  HeadersFunction =
  (
    headersArgs,
  ) => {
    return boundary.headers(
      headersArgs,
    );
  };
