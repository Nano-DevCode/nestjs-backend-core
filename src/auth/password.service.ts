import { Injectable, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordService {
  // Hash dummy precomputado con bcrypt (cost factor 10) para mitigar ataques de tiempo (User Enumeration)
  private readonly dummyHash =
    '$2b$10$CwTycUXWue0Thq9StjUM0uJ8g2u.YnU4/X4/P9g0b/K5W1Qj1o6mG';

  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async compareWithDummy(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.dummyHash);
  }

  validatePasswordStrength(password: string): void {
    if (!password || password.length < 8) {
      throw new BadRequestException(
        'La contraseña debe tener al menos 8 caracteres',
      );
    }
  }
}
