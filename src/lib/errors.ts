/** Expected, user-correctable failures. `code` is an i18n message key. */
export class AppError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export class ForbiddenError extends AppError {
  constructor() {
    super("errForbidden");
  }
}
