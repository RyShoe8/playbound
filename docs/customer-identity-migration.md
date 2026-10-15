# Customer identity data migration

Unix identity mode remains opt-in. Existing nonempty Teeworlds data blocks enrollment unless the root helper verifies a completed offline activation. The operator tool prepares, activates, recovers and rolls back data. Separate explicit commands coordinate the stopped server's runtime-profile enrollment. It never changes database records or plugin policy. Activation reserves/reuses the stable Unix account; normal creation leaves identity mode off.

## Offline preparation

Use a planned maintenance window. Preparation refuses while **any** process uses the legacy `playbound` UID, including the agent and unrelated games. Activation, rollback and recovery also require the reserved game UID offline. Do not stop populated games just to migrate data. Wait for a safe maintenance window.

As a direct root operator:

```sh
/usr/local/libexec/playbound-customer-data-migration prepare SERVER_ID
/usr/local/libexec/playbound-customer-data-migration verify SERVER_ID
```

The ID must be 24 lowercase hexadecimal characters. The tool has no agent sudo permission. There are no caller-supplied paths, commands or environment overrides. Responses contain only identity, phase/count and status, never file contents.

Fixed source: `/var/lib/playbound-host/customer-sandboxes/pb-SERVER_ID`. Root-private checkpoint: `/var/lib/playbound-customer-runtime/SERVER_ID/control/legacy-checkpoint-v1`, containing `data/` and `manifest.json`. Preparation creates no active UID data home and leaves the source untouched.

Limits: 8,192 entries, 16 nested levels, 256 MiB per file, 2 GiB total. Links, special files, foreign ownership and group/other-writable entries are rejected. These are migration limits, not customer storage quotas. Unsupported trees need operator review; do not omit files or weaken checks to force a successful run.

Preparation locks against the UID supervisor, copies through pinned no-follow descriptors, checks for mutation, hashes the source again and fsyncs the private checkpoint before atomic publication. Repetition verifies the existing checkpoint and source; source drift fails without replacing either copy.

## Activation and data rollback

Install matching agent and root helpers before activation. Keep the agent and both process identities stopped throughout each operation.

```sh
/usr/local/libexec/playbound-customer-data-migration activate SERVER_ID
/usr/local/libexec/playbound-customer-data-migration enroll SERVER_ID
/usr/local/libexec/playbound-customer-data-migration recover SERVER_ID
/usr/local/libexec/playbound-customer-data-migration rollback SERVER_ID
/usr/local/libexec/playbound-customer-data-migration complete-rollback SERVER_ID
```

Activation verifies the source against the checkpoint and verifies a new private copy before reassigning that copy to the reserved UID. Existing nonempty UID data is refused. A durable root-owned `control/migration.json` journal records exact directory identities before changes. Linux atomic directory exchange retains a preexisting empty UID home; an absent home uses atomic rename. Original legacy files move to `control/legacy-source-retained-v1`. A root-owned empty placeholder blocks the old service-user launch path. Only after both transitions finish is the journal active. The root helper verifies the active journal, UID data identity and legacy placeholder before permitting the migrated runtime to start.

Rollback copies and verifies the **latest** UID data, including later game progress, then atomically exchanges it with the legacy placeholder. The original checkpoint, original legacy files and latest UID copy remain retained. Altered originals, placeholders or unexpected directory identities require review.

Runtime enrollment requires a separate explicit command. After activation, run `enroll` before restarting the agent. It requires one stopped/failed Teeworlds job, no retained managed-room row, a root-verified active data transaction, both UIDs offline and the runtime lock. It changes only that job's `identityProfile`. After data rollback, run `complete-rollback` to remove that job's sticky UID enrollment only after the restored data identity is verified. Ordinary agent operations still cannot downgrade enrollment. No unrelated registry entries are modified; the root journal records actor UID, time, target profile and completion state. Do not hand-edit registry files. General production migration remains off pending an approved maintenance rollout and human Join verification.

## Interrupted operations

Incomplete copies remain private as `legacy-incomplete-*`, `activation-copy-v1` or `rollback-copy-v1`. Copies left before journal publication require root operator review; they are never discarded or overwritten automatically. The tool performs no recursive deletion of saved files or runtime homes.

With a journal, `recover` resumes only its recorded transaction. Directory identities distinguish interruption before and after swaps. Changed legacy progress blocks activation recovery. Ambiguous state fails closed. UID starts refuse activating, rolling-back and rolled-back journals. Repeating activation preserves current game progress; repeating rollback preserves later legacy progress. Rolled-back data cannot be implicitly reactivated.

Interrupted profile transitions are recovered by repeating `enroll` or `complete-rollback`, not by guessing the intended profile in `recover`. The registry replacement and journal are durable; retries preserve other jobs and do not copy old save data again. UID launch rejects an enrollment transition still marked pending.

## Acceptance scope

The VPS fixture used two reserved test UIDs, avoiding interruption of the live service UID. It covered actual checkpoint/activation, managed start, a real zero-player/four-slot query, unchanged game PID across agent restart, full scoped shutdown, writes as the game UID and rollback preserving those writes. A separate fixture exercised explicit enrollment and completed profile rollback through the real agent registry reader, preserving the neighboring job and newer save progress. The actual operator CLI always fixes the legacy UID to `playbound` and requires maintenance. No production customer was migrated. Human Join and the maintenance rollout remain separate gates.
