import { Module } from '@nestjs/common';
import { CategoriasDisciplinaController } from './categorias-disciplina.controller';
import { CategoriasDisciplinaService } from './categorias-disciplina.service';

@Module({
  controllers: [CategoriasDisciplinaController],
  providers: [CategoriasDisciplinaService],
  exports: [CategoriasDisciplinaService],
})
export class CategoriasDisciplinaModule {}
