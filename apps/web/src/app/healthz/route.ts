export function GET() {
  return Response.json({ status: "ok", service: "web", time: new Date().toISOString() });
}

