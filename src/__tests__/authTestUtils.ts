import { NextRequest } from 'next/server';
import { AUTH_COOKIE, createSessionToken } from '../lib/auth';

type TestRequestInit = {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
};

export function adminRequest(url: string, init: TestRequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('cookie', `${AUTH_COOKIE}=${createSessionToken('admin')}`);
  return new NextRequest(url, { ...init, headers });
}

export function playerRequest(url: string, init: TestRequestInit = {}) {
  return new NextRequest(url, init);
}
