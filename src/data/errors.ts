/** Errores de la capa de datos, con mensajes comprensibles para la usuaria (sin datos clínicos). */
export class VaultLockedError extends Error {
  constructor() {
    super('La aplicación está bloqueada. Desbloquéala para continuar.');
    this.name = 'VaultLockedError';
  }
}

export interface FieldIssue {
  path: string;
  message: string;
}

export class ValidationError extends Error {
  issues: FieldIssue[];
  constructor(issues: FieldIssue[], message?: string) {
    super(message ?? (issues[0] ? `Revisa los datos: ${issues[0].message}` : 'Datos inválidos'));
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

export class IntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrityError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'Este registro fue modificado en otra ventana o sesión. Vuelve a abrirlo para ver la versión actual.') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class LockedRecordError extends Error {
  constructor(message = 'Este registro está finalizado y no puede modificarse directamente. Usa “Corregir / enmendar” indicando el motivo.') {
    super(message);
    this.name = 'LockedRecordError';
  }
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export function friendlyError(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'QuotaExceededError') {
      return 'No hay espacio suficiente en el dispositivo para guardar. Libera espacio o elimina adjuntos grandes.';
    }
    if (
      e instanceof ValidationError ||
      e instanceof IntegrityError ||
      e instanceof ConflictError ||
      e instanceof LockedRecordError ||
      e instanceof StorageError ||
      e instanceof VaultLockedError ||
      e.name === 'WrongSecretError'
    ) {
      return e.message;
    }
    // Mensaje genérico: no exponemos detalles técnicos que podrían incluir datos.
    return 'Ocurrió un error inesperado. Tus datos guardados no se han modificado.';
  }
  return 'Ocurrió un error inesperado.';
}
