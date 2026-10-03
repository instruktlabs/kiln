# Stabilization release disposition — 3 October 2026

Matt confirmed that the farmer hand fixes look good, reported that he could not
reproduce the water jump in the local candidate, and authorized settling performance,
reviewing/organizing the changes, then proceeding with main and the Cloudflare site.
This supersedes the earlier hold for owner review and release authorization. It does
not authorize npm publication or Troy construction.

## Scene acceptance

The reviewed local candidate is `g9-code5` with Golden Gate runtime SHA-256
`1a01a81a912157936f05a2060f1df377c418607a83567753e4db2b0257bdb556`.
Its latest still-image site artifact is `79c52c97…`; all 243 scene files are identical
to the previously functionally qualified candidate. Farm uses runtime SHA-256
`f167f46cdf22b72ea860ca183cee901cfc6cc86c089ab39f01ea01556aebe4ef`.

Close FARM-4's owner appearance check and GG-5's release hold on that scoped local
evidence. No second speculative water fix was made. Reopen the report if a particular
camera path or device reproduces it. Physical-phone/tablet qualification remains
deferred; desktop touch checks do not stand in for hardware qualification. Existing
Foundry and vehicle asset acceptance statuses are unchanged.

## Performance decision

The focused campaign collected eight original/candidate 60-second pairs and one
135-second Farm pair: 18 observations, 20.5 measured minutes. All were collection-valid;
17 met the unchanged D41 limits. The candidate Golden Gate balanced flyover recorded
one 50.1 ms interval near 57 seconds. The original maximum was 50.0 ms. Both builds'
p95 was 8.4 ms on the measured 120 Hz desktop.

The original blocks also failed post-run idle checks: CPU maxima 16.473% and 16.159%,
measured after the blocks. These readings do not establish the cause of the late frame.
The nearby 41.3 ms renderer-call duration is wall time, not measured CPU execution.
The event is distinct from the earlier reproduced first-use shadow compilation fix.

An unchanged targeted flyover pair added two measured minutes. Original/candidate
maxima were 50.0/16.7 ms; both D41 and before/internal/after quiet checks passed.
The separate 135-second Farm pair had 25.0/33.4 ms maxima and 8.4 ms p95 on both sides.
Earlier allocation probes retain roughly 36 ms late GC and unresolved allocator
ownership; no leak or late-hitch cure is claimed.

**Release judgment:** proceed with these documented limitations. There is no
reproduced remaining performance regression with an actionable cause that justifies
another code change or broader campaign. Do not repeat measurements until something
changes or the hitch recurs. This is a bounded release decision, not a passing
all-run performance audit: original failures remain failures, thresholds are unchanged,
and all-tier/repeated/device qualification remains unclaimed. The 108-minute matrix
stays deferred. Reopen investigation for recurring >50 ms desktop frames, sustained
frame-time regression, or repeatable late pauses, with the exact build/path/device.

The preserved raw evidence and independent audits live under
`scenes/.tmp/alignment-perf-focused/`; causal review is under
`tmp/alignment-20261003/focused-flyover-triage/`. Earlier results are not overwritten.

## Release execution

Review the source, tests, generated runtime and pinned delivery changes in coherent
commit groups. Refresh remote state; run local offline core/scene/site gates. Main
requires eight CI checks and strict up-to-date integration; use a pull request and
wait for all applicable checks without bypassing branch protection.

After merge, build from clean main, validate exact artifact and scene hashes, and
verify/upload only the four new immutable R2 objects (two scene input archives and
two bridge capture PNGs). Existing paths must not be overwritten with different
bytes. Run the deployment dry run, deploy Pages, and verify production build-info,
assets and all three scene entry/exit flows. Retain the previous production deployment
`33c716c7-16e5-46c6-93bf-f2260f0082be` as the rollback reference.

This document records the decision and procedure, not completion of those release
actions. Execution receipts are retained under `tmp/release-20261003/`.
