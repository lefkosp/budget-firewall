import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";
import { config } from "../config/env";
import { cronAuth } from "./cronAuth";

function mockRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

function mockReq(headerValue?: string): Request {
  return { headers: headerValue !== undefined ? { "x-cron-secret": headerValue } : {} } as unknown as Request;
}

describe("cronAuth", () => {
  const originalSecret = config.cronSecret;

  beforeEach(() => {
    config.cronSecret = "test-cron-secret";
  });

  afterEach(() => {
    config.cronSecret = originalSecret;
  });

  it("calls next() when the header matches the configured secret", () => {
    const next = vi.fn();
    const res = mockRes();

    cronAuth(mockReq("test-cron-secret"), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the header is missing", () => {
    const next = vi.fn();
    const res = mockRes();

    cronAuth(mockReq(undefined), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects with 401 when the header doesn't match", () => {
    const next = vi.fn();
    const res = mockRes();

    cronAuth(mockReq("wrong-secret"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects with 401 when CRON_SECRET isn't configured, even if a header is presented", () => {
    config.cronSecret = undefined;
    const next = vi.fn();
    const res = mockRes();

    cronAuth(mockReq("anything"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
