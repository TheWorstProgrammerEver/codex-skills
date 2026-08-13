import { expect, test } from 'vitest'
import { getLocalSupabaseConfig } from './localSupabase'

test('app health owns only its exact local gateway path', async () => {
  const { url } = getLocalSupabaseConfig()
  const exact = await fetch(`${url}/functions/v1/app-health`)
  const suffix = await fetch(`${url}/functions/v1/app-health/unexpected`)

  expect(exact.status).toBe(200)
  expect(await exact.json()).toMatchObject({ ok: true, service: 'app-health' })
  expect(suffix.status).toBe(404)
  expect(await suffix.json()).toEqual({ error: 'Not found' })
})
