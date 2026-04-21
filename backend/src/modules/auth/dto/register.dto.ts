import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsEnum,
  IsOptional,
  Matches,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @IsEmail({}, { message: 'Adresse email invalide' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
  })
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @IsEnum([UserRole.PATIENT, UserRole.PSYCHOLOGIST], {
    message: 'Rôle invalide',
  })
  role: UserRole.PATIENT | UserRole.PSYCHOLOGIST;

  @IsOptional()
  @IsString()
  timezone?: string;

  // RGPD: must be explicitly accepted
  @IsOptional()
  gdprConsent?: boolean;
}
