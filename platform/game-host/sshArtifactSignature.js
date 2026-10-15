import fs from "node:fs";
import { createHash, createPublicKey, verify } from "node:crypto";

const wire = (value) => { const size = Buffer.alloc(4); size.writeUInt32BE(value.length); return Buffer.concat([size, value]); };
function reader(data) {
  let offset = 0;
  return {
    field() {
      if (offset + 4 > data.length) throw new Error("Hypersomnia signature is truncated");
      const size = data.readUInt32BE(offset); offset += 4;
      if (size > 4096 || offset + size > data.length) throw new Error("Hypersomnia signature field is invalid");
      const value = data.subarray(offset, offset + size); offset += size; return value;
    },
    done() { if (offset !== data.length) throw new Error("Hypersomnia signature contains trailing data"); },
  };
}

/** OpenSSH PROTOCOL.sshsig, restricted to a pinned Ed25519 signer and namespace. */
export function verifySshArtifactSignature(filename, signature, expectedKey) {
  const match = /^-----BEGIN SSH SIGNATURE-----\n([A-Za-z0-9+/=\n]+)\n-----END SSH SIGNATURE-----\s*$/.exec(signature.replace(/\r\n/g, "\n"));
  if (signature.length > 8192 || !match) throw new Error("Hypersomnia signature armor is invalid");
  const data = Buffer.from(match[1].replace(/\n/g, ""), "base64");
  if (data.length < 10 || data.subarray(0, 6).toString() !== "SSHSIG" || data.readUInt32BE(6) !== 1) throw new Error("Hypersomnia signature header is invalid");
  const outer = reader(data.subarray(10));
  const publicKey = outer.field(), namespace = outer.field(), reserved = outer.field(), algorithm = outer.field(), signed = outer.field(); outer.done();
  if (!publicKey.equals(Buffer.from(expectedKey, "base64")) || namespace.toString() !== "self_updater" || reserved.length || algorithm.toString() !== "sha512") throw new Error("Hypersomnia signature signer, namespace or algorithm is not trusted");
  const keyReader = reader(publicKey), keyType = keyReader.field(), rawKey = keyReader.field(); keyReader.done();
  const signatureReader = reader(signed), signatureType = signatureReader.field(), rawSignature = signatureReader.field(); signatureReader.done();
  if (keyType.toString() !== "ssh-ed25519" || signatureType.toString() !== "ssh-ed25519" || rawKey.length !== 32 || rawSignature.length !== 64) throw new Error("Hypersomnia requires an Ed25519 artifact signature");
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 1 || stat.size > 256 * 1024 ** 2) throw new Error("Hypersomnia signed image is invalid or too large");
  const hash = createHash("sha512"), sha256 = createHash("sha256"), fd = fs.openSync(filename, "r"), buffer = Buffer.alloc(1024 ** 2);
  try { let count; while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) { hash.update(buffer.subarray(0, count)); sha256.update(buffer.subarray(0, count)); } }
  finally { fs.closeSync(fd); }
  const message = Buffer.concat([Buffer.from("SSHSIG"), wire(namespace), wire(reserved), wire(algorithm), wire(hash.digest())]);
  const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawKey]), format: "der", type: "spki" });
  if (!verify(null, message, key, rawSignature)) throw new Error("Hypersomnia image failed its upstream signature check");
  return { size: stat.size, digest: `sha256:${sha256.digest("hex")}` };
}
