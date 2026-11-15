import {
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';

const normalizar = (valor: unknown) =>
  typeof valor === 'string' ? valor.trim().toLowerCase() : valor;

/**
 * DT-54 — El email se escribe dos veces al cargarlo, por si la persona se
 * equivoca. Compara sin distinguir mayúsculas ni espacios en los extremos,
 * igual que se guarda el email.
 */
@ValidatorConstraint({ name: 'confirmaEmail', async: false })
export class ConfirmaEmailConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    // Vacío lo informa `@IsNotEmpty` ("Confirmá el email."), sin un segundo error.
    if (value === undefined || value === null || value === '') return true;
    const [propiedad] = args.constraints as string[];
    return normalizar(value) === normalizar((args.object as Record<string, unknown>)[propiedad]);
  }

  defaultMessage(): string {
    return 'Los emails no coinciden.';
  }
}

/** Uso: `@ConfirmaEmail('email')` sobre el campo `confirmarEmail`. */
export function ConfirmaEmail(
  propiedad: string,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'confirmaEmail',
      target: object.constructor,
      propertyName: propertyName as string,
      constraints: [propiedad],
      options: validationOptions,
      validator: ConfirmaEmailConstraint,
    });
  };
}
