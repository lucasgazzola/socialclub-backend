import { IsOptional, IsString } from 'class-validator';

export class GetUsuariosQueryDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  rol?: string;
}
