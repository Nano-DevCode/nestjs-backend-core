import {
  Controller,
  Post,
  Patch,
  Body,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
  Get,
  Query,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { Roles, RequirePermissions } from './decorators/auth.decorator';
import { PermissionsGuard } from './guards/permissions.guard';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { Throttle } from '@nestjs/throttler';
import { TwoFactorGuard } from '../two-factor/guards/two-factor.guard';
import { Require2FA } from '../two-factor/decorators/require-2fa.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiQuery,
} from '../common/scalar/scalar.decorators';

interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  isTwoFactorEnabled?: boolean;
}

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@ApiTags('Auth Web & Core')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Registra un nuevo usuario en la plataforma',
    description:
      'Crea la cuenta de usuario con perfil asociado, asigna el rol base y despacha el correo de verificación.',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuario registrado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de validación inválidos o incompletos',
  })
  @ApiResponse({
    status: 409,
    description: 'El correo electrónico ya se encuentra registrado',
  })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Patch('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('bearer-jwt')
  @ApiCookieAuth('cookie-jwt')
  @ApiOperation({
    summary: 'Actualiza el perfil del usuario autenticado',
    description:
      'Permite modificar nombre, apellidos, biografía o avatar del usuario activo.',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil actualizado exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado / Token no válido',
  })
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(req.user.id, updateProfileDto);
  }

  @Get('verify-email')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Verifica la dirección de correo electrónico',
    description:
      'Confirma la cuenta mediante el token criptográfico enviado por correo tras el registro.',
  })
  @ApiQuery({
    name: 'token',
    type: String,
    required: true,
    description: 'Token criptográfico de verificación de email',
  })
  @ApiResponse({
    status: 200,
    description: 'Correo verificado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Token inválido o expirado',
  })
  async verifyEmail(@Query() query: VerifyEmailDto) {
    return this.authService.verifyEmail(query.token);
  }

  @Post('resend-verification')
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  @ApiOperation({
    summary: 'Reenvía el enlace de verificación de correo',
    description:
      'Genera un nuevo token de verificación y lo despacha al correo provisto si no está verificado.',
  })
  @ApiResponse({
    status: 200,
    description: 'Correo de verificación reenviado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'La cuenta ya fue verificada o el correo no existe',
  })
  async resendVerification(@Body() resendDto: ResendVerificationDto) {
    return this.authService.resendVerificationEmail(resendDto.email);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Inicia sesión en la plataforma Web',
    description:
      'Valida credenciales y emite cookies HttpOnly con access_token y refresh_token, o requiere desafío 2FA.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Autenticación exitosa (establece cookies HttpOnly) o requiere verificación 2FA (devuelve tempToken).',
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas o correo no verificado',
  })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    const cookies = req.cookies as Record<string, string> | undefined;
    const trustedDeviceId = cookies?.['trusted_device'];

    return this.authService.login(
      user,
      res,
      undefined,
      trustedDeviceId,
      loginDto.trustDevice,
    );
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Renueva el Access Token mediante Cookie Refresh Token',
    description:
      'Aplica rotación estricta de Refresh Token con detección de reuso para mitigar secuestro de sesión.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens renovados exitosamente en cookies HttpOnly',
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token ausente, expirado o reutilizado',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = req.cookies as Record<string, string> | undefined;
    const token = cookies?.['refresh_token'];
    if (!token) {
      throw new UnauthorizedException('Refresh token ausente');
    }

    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!refreshSecret && process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL: JWT_REFRESH_SECRET no está configurado en producción.',
      );
    }

    let payload: { sub: string; tokenId: string };
    try {
      payload = this.jwtService.verify<{ sub: string; tokenId: string }>(
        token,
        {
          secret: refreshSecret || 'super_refresh_jwt_key',
          algorithms: ['HS256'],
        },
      );
    } catch {
      this.authService.clearAuthCookies(res);
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const newTokenId = uuidv4();
    const rotationResult = await this.sessionService.validateAndRotateToken(
      payload.sub,
      payload.tokenId,
      newTokenId,
      604800,
    );

    if (!rotationResult.success && rotationResult.isReuse) {
      await this.sessionService.revokeAllUserSessions(payload.sub);
      this.authService.clearAuthCookies(res);
      throw new UnauthorizedException('Reúso detectado. Sesiones invalidadas.');
    }

    const userContext = await this.authService.getUserAuthContextById(
      payload.sub,
    );
    return this.authService.login(
      userContext,
      res,
      rotationResult.activeTokenId,
    );
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('bearer-jwt')
  @ApiCookieAuth('cookie-jwt')
  @ApiOperation({
    summary: 'Cierra la sesión activa del usuario',
    description:
      'Invalida el token en la blacklist de Redis, revoca la sesión en base de datos y purga las cookies.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesión cerrada exitosamente',
  })
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = req.cookies as Record<string, string> | undefined;
    const refreshToken = cookies?.['refresh_token'];

    if (refreshToken) {
      try {
        const payload = this.jwtService.verify<{ tokenId: string }>(
          refreshToken,
          {
            secret: process.env.JWT_REFRESH_SECRET || 'super_refresh_jwt_key',
            algorithms: ['HS256'],
          },
        );
        await this.sessionService.revokeSession(req.user.id, payload.tokenId);
      } catch {
        // Token expirado o corrupto, se ignora el error de firma
      }
    } else {
      await this.sessionService.revokeAllUserSessions(req.user.id);
    }

    // Invalidar token de acceso actual en la lista negra de Redis
    const authHeader = req.headers.authorization;
    const rawAccessToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : cookies?.['access_token'];

    if (rawAccessToken) {
      try {
        const decoded: unknown = this.jwtService.decode(rawAccessToken);
        if (
          typeof decoded === 'object' &&
          decoded !== null &&
          !Array.isArray(decoded)
        ) {
          const payload = decoded as Record<string, unknown>;
          const jti =
            typeof payload['jti'] === 'string' ? payload['jti'] : undefined;
          const exp =
            typeof payload['exp'] === 'number' ? payload['exp'] : undefined;
          const now = Math.floor(Date.now() / 1000);
          const ttl = exp ? Math.max(1, exp - now) : 900;

          if (jti) {
            await this.sessionService.blacklistToken(jti, ttl);
          }
          const signature = rawAccessToken.split('.')[2];
          if (signature) {
            await this.sessionService.blacklistToken(signature, ttl);
          }
        }
      } catch {
        // Ignorar si no se puede decodificar
      }
    }

    this.authService.clearAuthCookies(res);

    return { message: 'Sesión cerrada exitosamente' };
  }

  @Get('admin-dashboard')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Roles('admin')
  @ApiBearerAuth('bearer-jwt')
  @ApiCookieAuth('cookie-jwt')
  @ApiOperation({
    summary: 'Endpoint de prueba con restricción de rol Administrador',
  })
  @ApiResponse({
    status: 200,
    description: 'Acceso autorizado como administrador',
  })
  @ApiResponse({
    status: 403,
    description: 'Rol insuficiente',
  })
  getAdminData(@Req() req: AuthenticatedRequest) {
    return { message: 'Acceso autorizado como administrador', user: req.user };
  }

  @Get('users-export')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermissions('users:export')
  @ApiBearerAuth('bearer-jwt')
  @ApiCookieAuth('cookie-jwt')
  @ApiOperation({
    summary: 'Endpoint protegido por permiso granular users:export',
  })
  @ApiResponse({
    status: 200,
    description: 'Permiso users:export validado',
  })
  @ApiResponse({
    status: 403,
    description: 'Permiso users:export no concedido al rol actual',
  })
  exportUserData(@Req() req: AuthenticatedRequest) {
    return { message: 'Permiso users:export validado', user: req.user };
  }

  @Post('critical-action')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(AuthGuard('jwt'), TwoFactorGuard)
  @Require2FA()
  @ApiBearerAuth('bearer-jwt')
  @ApiCookieAuth('cookie-jwt')
  @ApiOperation({
    summary: 'Ejecuta una acción crítica que exige elevación Step-Up 2FA',
    description:
      'Requiere cabecera X-2FA-Code o sesión de dispositivo de confianza para completarse.',
  })
  @ApiResponse({
    status: 200,
    description: 'Acción crítica ejecutada exitosamente',
  })
  @ApiResponse({
    status: 403,
    description: 'Código 2FA ausente o inválido para la elevación de privilegios',
  })
  executeCriticalAction(@Req() req: AuthenticatedRequest) {
    return {
      message:
        'Acción crítica ejecutada exitosamente bajo validación Step-Up 2FA.',
      user: req.user,
    };
  }
}
