import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { validatePassword } from '../domain/password-policy';

/**
 * 비밀번호 정책 class-validator 제약(§10). 같은 객체의 loginId 를 참조해 아이디 포함 여부도 검사.
 */
@ValidatorConstraint({ name: 'isStrongPassword', async: false })
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const loginId = (args.object as { loginId?: string }).loginId;
    return typeof value === 'string' && validatePassword(value, loginId).ok;
  }

  defaultMessage(args: ValidationArguments): string {
    const loginId = (args.object as { loginId?: string }).loginId;
    const reasons = validatePassword(String(args.value ?? ''), loginId).reasons;
    return `비밀번호 정책 위반: ${reasons.join(', ')}`;
  }
}

export function IsStrongPassword(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: IsStrongPasswordConstraint,
    });
  };
}
