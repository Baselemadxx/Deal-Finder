export class AdapterError extends Error {
  public readonly code: string;
  public readonly httpStatus?: number;

  constructor(message: string, code: string, httpStatus?: number) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export class AdapterBlockedError extends AdapterError {
  constructor(url: string, detail: string, httpStatus?: number) {
    super(
      `Automated access blocked at ${url}: ${detail}. Failing loudly instead of returning empty data.`,
      'ADAPTER_BLOCKED',
      httpStatus
    );
    this.name = 'AdapterBlockedError';
  }
}

export class AdapterShapeChangedError extends AdapterError {
  constructor(sourceName: string, url: string, expectedSelector: string) {
    super(
      `HTML structure changed for ${sourceName} (${url}): expected selector/marker "${expectedSelector}" was not found. Failing loudly instead of returning empty data.`,
      'ADAPTER_SHAPE_CHANGED'
    );
    this.name = 'AdapterShapeChangedError';
  }
}

export class RobotsDisallowedError extends AdapterError {
  constructor(url: string) {
    super(
      `robots.txt disallows automated access to ${url}. Respecting robots.txt and failing loudly so you can review this source.`,
      'ROBOTS_DISALLOWED'
    );
    this.name = 'RobotsDisallowedError';
  }
}

export class AdapterHttpError extends AdapterError {
  constructor(url: string, status: number, statusText: string) {
    super(`HTTP ${status} (${statusText}) fetching ${url}`, 'ADAPTER_HTTP_ERROR', status);
    this.name = 'AdapterHttpError';
  }
}
