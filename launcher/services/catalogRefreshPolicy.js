// Authenticated catalog reads bypass the CDN and can take over 20 seconds.
// Keep the public feed fast while allowing tester/admin feeds to complete.
function catalogRequestTimeoutMs(includeTesting) {
  return includeTesting ? 45_000 : 10_000;
}

function shouldApplyCatalogResponse(request, current) {
  return request.id === current.id &&
    request.includeTesting === current.includeTesting &&
    (!request.includeTesting || request.token === current.token);
}

module.exports = { catalogRequestTimeoutMs, shouldApplyCatalogResponse };
