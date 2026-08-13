type AppHealthHandlerDependencies = {
  readEnvironment: () => string
}

const appHealthPath = '/app-health'

export const createAppHealthHandler = ({ readEnvironment }: AppHealthHandlerDependencies) => (request: Request) => {
  if (new URL(request.url).pathname !== appHealthPath) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  return Response.json({
    ok: true,
    service: 'app-health',
    environment: readEnvironment()
  })
}
