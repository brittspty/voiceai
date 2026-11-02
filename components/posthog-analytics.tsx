"use client";

import { useEffect } from "react";
import { bootPosthog, POSTHOG_API_HOST, type PosthogSdk } from "@/lib/analytics/posthog";

async function loadPosthogSdk(): Promise<PosthogSdk> {
  const posthog = (await import("posthog-js")).default;
  return {
    init: (key, config) => {
      const { before_send: sanitize, ...rest } = config;
      posthog.init(key, {
        ...rest,
        before_send: (event) => {
          if (!event) return null;
          const sanitized = sanitize({
            event: event.event,
            properties: event.properties as Record<string, unknown> | undefined,
            $set: event.$set as Record<string, unknown> | undefined,
            $set_once: event.$set_once as Record<string, unknown> | undefined,
          });
          if (!sanitized) return null;
          if (sanitized.properties) event.properties = sanitized.properties as typeof event.properties;
          event.$set = sanitized.$set as typeof event.$set;
          event.$set_once = sanitized.$set_once as typeof event.$set_once;
          return event;
        },
      });
    },
    identify: (distinctId, properties) => {
      posthog.identify(distinctId, properties);
    },
    reset: (resetDeviceId) => {
      posthog.reset(Boolean(resetDeviceId));
    },
    stopSessionRecording: () => {
      posthog.stopSessionRecording();
    },
    startSessionRecording: () => {
      posthog.startSessionRecording();
    },
  };
}

/** Mounted only when the server gate says PostHog may load. The browser checks the real URL again before importing the SDK. */
export function PostHogAnalytics(props: { apiKey: string; userId: string | null; role: string | null }) {
  useEffect(() => {
    const secureCookie = window.location.protocol === "https:";
    const session = bootPosthog(
      {
        apiKey: props.apiKey || process.env.NEXT_PUBLIC_POSTHOG_KEY || "",
        apiHost: POSTHOG_API_HOST,
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        role: props.role,
        userId: props.userId,
        secureCookie,
        env: {
          POSTHOG_ENABLED: "on",
          NEXT_PUBLIC_POSTHOG_KEY: props.apiKey || process.env.NEXT_PUBLIC_POSTHOG_KEY || "",
        },
      },
      { loadSdk: loadPosthogSdk },
    );

    const sync = () => {
      session.noteLocation({
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      });
    };
    const onSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (!session.isLogout(form.getAttribute("action"))) return;
      session.reset();
    };
    const push = history.pushState.bind(history);
    const replace = history.replaceState.bind(history);
    history.pushState = (...args) => {
      push(...args);
      sync();
    };
    history.replaceState = (...args) => {
      replace(...args);
      sync();
    };
    window.addEventListener("popstate", sync);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      session.reset();
      session.cancel();
      history.pushState = push;
      history.replaceState = replace;
      window.removeEventListener("popstate", sync);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [props.apiKey, props.role, props.userId]);

  return null;
}
