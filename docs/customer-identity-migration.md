# Customer identity migration checkpoints

The Unix identity runtime remains opt-in. Existing nonempty Teeworlds data still
blocks enrollment. The checkpoint tool is an operator foundation, **not a server
migration command**. It does not change the runtime profile, reserve accounts,
activate files, alter database records, or enable executable plugins.

## Preparation

Use a planned maintenance window. Preparation refuses while **any** process has
the legacy `playbound` UID, including the agent and unrelated games using that
account. Do not stop populated games merely to obtain a checkpoint. Wait until
workloads can safely be stopped under the existing maintenance policy.

As a direct root operator, run the installed fixed helper:

```sh
/usr/local/libexec/playbound-customer-data-migration prepare SERVER_ID
/usr/local/libexec/playbound-customer-data-migration verify SERVER_ID
```

`SERVER_ID` must be a 24-character lowercase hexadecimal identity. The tool has
no agent sudo permission. It accepts no source/destination path, engine, command,
or environment override. Both operations return only identity, entry count and
verification status; file names and contents are not printed.

The fixed source is
`/var/lib/playbound-host/customer-sandboxes/pb-SERVER_ID`. The root-private
checkpoint is
`/var/lib/playbound-customer-runtime/SERVER_ID/control/legacy-checkpoint-v1`,
containing `data/` and a SHA-256 `manifest.json`. No active `data/` directory is
created or replaced. The original source remains in place with its ownership.

Limits: 8,192 entries, 16 nested directory levels, 256 MiB per file and 2 GiB
total. Symlinks, hardlinked files, special files, foreign-owned entries and
group/other-writable entries are refused. These are migration bounds rather than
customer storage quotas. An operator must review larger or unsupported trees;
do not loosen checks or omit files to force success.

Preparation takes the same root-owned runtime lock as the UID supervisor and
checks the legacy UID before and after copying. Every file is copied through
pinned, no-follow descriptors and checked for mutation; the whole source is
hashed again before publication. The completed checkpoint is atomically renamed
and directory-fsynced. Repeating prepare verifies the checkpoint and compares
the source; changed source data fails without replacing either copy.

## Failures and remaining activation gate

A failed/interrupted copy may leave a root-private `legacy-incomplete-*`
directory in `control/`. It is not a completed checkpoint and is never read by
the game. Retain it for operator review. The tool performs no recursive cleanup
and never deletes source files or a runtime home.

Do not manually rename a checkpoint into the UID data directory or lift the
agent's enrollment guard. The remaining implementation must establish an atomic,
durable activation transaction, stop/start coordination, interrupted-activation
recovery, and rollback which retains game progress written after activation.
Those require separate fixture acceptance before real customer migration.
