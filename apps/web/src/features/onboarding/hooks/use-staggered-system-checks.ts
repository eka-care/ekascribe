'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSDK } from '@/features/session/services/sdk-provider';

const CHECK_MIN_DURATION_MS = 800;
const CHECK_STAGGER_MS = 400;
/**
 * Hard deadline for the SDK to report results. Beyond this, any check still
 * in `running` is force-flipped to `failed` so the UI never gets stuck on a
 * spinner — happens when offline (SDK can't reach its config endpoint) or
 * when the worker silently swallows a test type.
 */
const CHECK_DEADLINE_MS = 12_000;

export type CheckStatus = 'pending' | 'running' | 'passed' | 'failed';

export interface SystemCheckItem {
  id: string;
  testType: string;
  title: string;
  descriptions: Record<CheckStatus, string>;
  status: CheckStatus;
}

const INITIAL_CHECKS: ReadonlyArray<Omit<SystemCheckItem, 'status'>> = [
  {
    id: 'internet',
    testType: 'internet_connectivity',
    title: 'Internet connection',
    descriptions: {
      pending: 'Stability check',
      running: 'Checking speed and stability…',
      passed: 'Connected and stable',
      failed: 'Unstable or no connection detected',
    },
  },
  {
    id: 'device-browser',
    testType: 'system_information',
    title: 'Device and browser',
    descriptions: {
      pending: 'Compatibility check',
      running: 'Checking browser version and OS…',
      passed: 'Compatible — browser supported',
      failed: 'Your browser may not be fully supported',
    },
  },
  {
    id: 'background',
    testType: 'shared_worker',
    title: 'Background performance',
    descriptions: {
      pending: 'Memory and CPU check',
      running: 'Checking available memory and processing…',
      passed: 'Sufficient memory and CPU available',
      failed: 'Low memory – EkaScribe may not work as expected',
    },
  },
  {
    id: 'network',
    testType: 'network_api_access',
    title: 'Network access',
    descriptions: {
      pending: 'Server connectivity check',
      running: 'Checking connection to EkaScribe servers…',
      passed: 'All servers reachable',
      failed: 'Could not reach EkaScribe servers',
    },
  },
];

const TEST_TYPE_ALIASES: Record<string, string> = {
  system_info: 'system_information',
  systeminfo: 'system_information',
  microphone: 'microphone_permission',
  mic: 'microphone_permission',
  network_api: 'network_api_access',
  networkapi: 'network_api_access',
  api_access: 'network_api_access',
  internet: 'internet_connectivity',
  connectivity: 'internet_connectivity',
  sharedworker: 'shared_worker',
  shared_worker_support: 'shared_worker',
};

const normalizeTestType = (testType: string) => testType.toLowerCase().replace(/[_\s-]/g, '_');

const findCheckIdForTestType = (testType: string): string | null => {
  const normalized = normalizeTestType(testType);
  const direct = INITIAL_CHECKS.find((c) => normalizeTestType(c.testType) === normalized);
  if (direct) return direct.id;
  const alias = TEST_TYPE_ALIASES[normalized];
  if (alias) {
    const aliased = INITIAL_CHECKS.find((c) => normalizeTestType(c.testType) === alias);
    if (aliased) return aliased.id;
  }
  return null;
};

const buildInitialChecks = (): SystemCheckItem[] =>
  INITIAL_CHECKS.map((c) => ({ ...c, status: 'pending' }));

interface Options {
  /** Flip true to start the run; subsequent flips are ignored. */
  start: boolean;
}

interface Result {
  checks: SystemCheckItem[];
  allChecksDone: boolean;
  hasFailures: boolean;
  retryFailedChecks: () => Promise<void>;
}

/**
 * Runs the SDK compatibility tests once and surfaces results with a small
 * stagger so the UI doesn't snap to all-green instantly. Cleans up pending
 * timers on unmount so we don't update state on a torn-down tree.
 */
export const useStaggeredSystemChecks = ({ start }: Options): Result => {
  const [checks, setChecks] = useState<SystemCheckItem[]>(buildInitialChecks);

  const startedRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const cancelledRef = useRef(false);

  const handleResult = useCallback((result: { test_type: string; status: string }) => {
    if (cancelledRef.current) return;
    const checkId = findCheckIdForTestType(result.test_type);
    if (!checkId) return;
    const status: CheckStatus = result.status === 'success' ? 'passed' : 'failed';
    const checkIndex = INITIAL_CHECKS.findIndex((c) => c.id === checkId);
    const startedAt = startedAtRef.current ?? Date.now();
    const target = startedAt + CHECK_MIN_DURATION_MS + checkIndex * CHECK_STAGGER_MS;
    const delay = Math.max(0, target - Date.now());
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      if (cancelledRef.current) return;
      setChecks((prev) => prev.map((c) => (c.id === checkId ? { ...c, status } : c)));
    }, delay);
    timersRef.current.add(timer);
  }, []);

  useEffect(() => {
    if (!start || startedRef.current) return;
    startedRef.current = true;
    startedAtRef.current = Date.now();

    setChecks((prev) => prev.map((c) => ({ ...c, status: 'running' as CheckStatus })));

    // Offline / SDK-hang failsafe: if any check is still `running` past the
    // deadline, force-flip it to `failed` so the screen never blocks the user
    // on a spinner. The cleanup effect clears this along with the other timers.
    const deadlineTimer = setTimeout(() => {
      timersRef.current.delete(deadlineTimer);
      if (cancelledRef.current) return;
      setChecks((prev) =>
        prev.map((c) => (c.status === 'running' ? { ...c, status: 'failed' } : c))
      );
    }, CHECK_DEADLINE_MS);
    timersRef.current.add(deadlineTimer);

    (async () => {
      try {
        await getSDK().runSystemCompatibilityTest(handleResult);
      } catch {
        if (cancelledRef.current) return;
        setChecks((prev) =>
          prev.map((c) => (c.status === 'running' ? { ...c, status: 'failed' } : c))
        );
      }
    })();
  }, [start, handleResult]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
  }, []);

  // The SDK only exposes a one-shot run-all API. To "retry failures" we
  // re-run all tests but only apply results to checks that were failed at
  // retry time — passed/pending cards keep their status.
  const retryFailedChecks = useCallback(async () => {
    if (cancelledRef.current) return;
    let failedIds: Set<string> = new Set();
    setChecks((prev) => {
      failedIds = new Set(prev.filter((c) => c.status === 'failed').map((c) => c.id));
      if (failedIds.size === 0) return prev;
      return prev.map((c) => (failedIds.has(c.id) ? { ...c, status: 'running' } : c));
    });
    if (failedIds.size === 0) return;

    try {
      await getSDK().runSystemCompatibilityTest((result) => {
        if (cancelledRef.current) return;
        const resultCheckId = findCheckIdForTestType(result.test_type);
        if (!resultCheckId || !failedIds.has(resultCheckId)) return;
        const status: CheckStatus = result.status === 'success' ? 'passed' : 'failed';
        setChecks((prev) => prev.map((c) => (c.id === resultCheckId ? { ...c, status } : c)));
      });
    } catch {
      if (cancelledRef.current) return;
      setChecks((prev) =>
        prev.map((c) =>
          failedIds.has(c.id) && c.status === 'running' ? { ...c, status: 'failed' } : c
        )
      );
    }
  }, []);

  const allChecksDone = checks.every((c) => c.status === 'passed' || c.status === 'failed');
  const hasFailures = checks.some((c) => c.status === 'failed');

  return { checks, allChecksDone, hasFailures, retryFailedChecks };
};
