import { IsNotEmpty, validate } from 'class-validator';
import { ConfirmaEmail } from './confirma-email.decorator';

class Alta {
  email!: string;

  @IsNotEmpty({ message: 'Confirmá el email.' })
  @ConfirmaEmail('email')
  confirmarEmail!: string;
}

const errores = async (email: string, confirmarEmail: string) => {
  const alta = Object.assign(new Alta(), { email, confirmarEmail });
  return (await validate(alta)).flatMap((e) => Object.values(e.constraints ?? {}));
};

/** DT-54 — El email se escribe dos veces al cargarlo. */
describe('@ConfirmaEmail (DT-54)', () => {
  it('acepta la confirmación igual, aunque cambien mayúsculas o espacios', async () => {
    expect(await errores('ana@club.local', 'ana@club.local')).toEqual([]);
    expect(await errores('Ana@Club.local', ' ana@club.LOCAL ')).toEqual([]);
  });

  it('rechaza una confirmación distinta', async () => {
    expect(await errores('ana@club.local', 'ana@clu.local')).toEqual(['Los emails no coinciden.']);
  });

  it('si falta la confirmación, informa un solo error', async () => {
    expect(await errores('ana@club.local', '')).toEqual(['Confirmá el email.']);
  });
});
