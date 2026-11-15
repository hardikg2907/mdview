// Starting the CLI takes about 0.3 s on an idle machine and about 2.5 s on a
// busy efficiency core. A deadline only has to catch a CLI that never answers;
// a healthy slow start must not fail the test. It also has to sit below the
// per-test timeout, or the test times out first and the stderr the deadline
// would have reported is lost.
export const CLI_DEADLINE_MS = 30_000;
export const CLI_TEST_TIMEOUT_MS = 45_000;
