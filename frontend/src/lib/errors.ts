export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class AuthError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'AUTH_ERROR')
    this.name = 'AuthError'
  }
}

export class SchemaError extends Error {
  constructor(
    message: string,
    public issues: unknown[],
  ) {
    super(message)
    this.name = 'SchemaError'
  }
}
