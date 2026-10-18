import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLoginPrefs, loginErrorKey, saveLoginPrefs } from '~/utils/login'

describe('loginErrorKey', () => {
  it('tells wrong credentials, lockout and a lost connection apart', () => {
    expect(loginErrorKey({ statusCode: 401 })).toBe('errorInvalid')
    expect(loginErrorKey({ status: 400 })).toBe('errorInvalid')
    expect(loginErrorKey({ statusCode: 429 })).toBe('errorTooMany')
    expect(loginErrorKey({ statusCode: 503 })).toBe('errorOffline')
    expect(loginErrorKey({ response: { status: 500 } })).toBe('errorOffline')
    expect(loginErrorKey(new TypeError('Failed to fetch'))).toBe('errorOffline')
    expect(loginErrorKey(null)).toBe('errorOffline')
  })
})

describe('login prefs', () => {
  beforeEach(() => localStorage.clear())

  it('remembers mode and username, never the secret', () => {
    expect(loadLoginPrefs()).toBeNull()
    saveLoginPrefs({ kind: 'pin', username: 'waiter1' })
    expect(loadLoginPrefs()).toEqual({ kind: 'pin', username: 'waiter1' })
    expect(localStorage.getItem('staff-login')).not.toContain('secret')
  })

  it('falls back on broken or blocked storage', () => {
    localStorage.setItem('staff-login', '{nope')
    expect(loadLoginPrefs()).toBeNull()
    localStorage.setItem('staff-login', JSON.stringify({ kind: 'x', username: 3 }))
    expect(loadLoginPrefs()).toEqual({ kind: 'password', username: '' })
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => saveLoginPrefs({ kind: 'pin', username: 'a' })).not.toThrow()
    spy.mockRestore()
  })
})
