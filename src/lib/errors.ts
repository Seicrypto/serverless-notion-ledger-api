export class AppError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(message, 500);
    this.name = "ConfigurationError";
  }
}
