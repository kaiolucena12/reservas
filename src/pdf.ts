import { jsPDF } from 'jspdf';
import logo from './assets/sllogo.png?inline';
import {
  dia,
  endereco,
  items,
  moeda,
  observacoes,
  valores,
  type Reserva,
} from './model';

const VERDE = '#152D26';
const DOURADO = '#F0C66B';
const TEXTO = '#23332D';
const CINZA = '#53675D';
const FUNDO = '#F0F4F1';
const BORDA = '#D9E2DC';

const CONDICAO_DANOS =
  'O contrato de locação prevê a cobrança de R$ 79,90 por mesa danificada, ' +
  'R$ 39,90 por cadeira danificada e R$ 19,90 por toalha danificada ou ' +
  'com mancha permanente. O material danificado ficará com o locatário.';

type Campo = [rotulo: string, valor: string];

export function comprovante(r: Reserva) {
  const pdf = new jsPDF({ format: 'a4', unit: 'mm' });
  const margem = 16;
  const largura = 178;
  const topo = 51;
  const limite = 274;
  const precos = valores(r);
  const itensLocados = items.filter(item => r[item.qty] > 0);

  function fonte(tamanho: number, negrito = false, cor = TEXTO) {
    pdf.setFont('helvetica', negrito ? 'bold' : 'normal');
    pdf.setFontSize(tamanho);
    pdf.setTextColor(cor);
  }

  // Cabeçalho com a identidade da empresa.
  pdf.setFillColor(VERDE);
  pdf.rect(0, 0, 210, 42, 'F');
  pdf.setFillColor(DOURADO);
  pdf.rect(0, 42, 210, 1, 'F');
  pdf.addImage(logo, 'PNG', 13, 3, 48, 48 * 430 / 580);

  fonte(19, true, '#FFFFFF');
  pdf.text('Seu Lima Locações', 194, 12, { align: 'right' });

  fonte(9, false, '#FFFFFF');
  pdf.text('Contato: (81) 99977-6309', 194, 19, { align: 'right' });
  pdf.text('CNPJ: 65.303.544/0001-78', 194, 25, { align: 'right' });

  const siteUrl = 'https://seulima.vercel.app/';
  const siteTexto = 'Site: seulima.vercel.app';

  fonte(9, false, DOURADO);
  pdf.text(siteTexto, 194, 31, { align: 'right' });

  const larguraLink = pdf.getTextWidth(siteTexto);
  pdf.link(194 - larguraLink, 27.5, larguraLink, 5, { url: siteUrl });

  fonte(8.5, true, DOURADO);
  pdf.text(`Reserva: ${r.nome}`, 194, 37, { align: 'right' });

  // Mede o corpo antes de desenhar para manter tudo em uma página.
  function corpo(desenhar: boolean, escala = 1) {
    let y = 0;
    const esquerda = margem + (largura - largura * escala) / 2;
    const px = (x: number) => esquerda + x * escala;
    const py = (posicao: number) => topo + posicao * escala;

    function escrever(
      valor: string,
      x: number,
      posicao: number,
      tamanho: number,
      opcoes: {
        negrito?: boolean;
        cor?: string;
        alinhar?: 'left' | 'right';
      } = {},
    ) {
      if (!desenhar) return;

      fonte(tamanho * escala, opcoes.negrito, opcoes.cor);
      pdf.text(valor, px(x), py(posicao), {
        align: opcoes.alinhar ?? 'left',
      });
    }

    function faixa(posicao: number, altura: number, cor: string) {
      if (!desenhar) return;

      pdf.setFillColor(cor);
      pdf.roundedRect(
        px(0),
        py(posicao),
        largura * escala,
        altura * escala,
        2 * escala,
        2 * escala,
        'F',
      );
    }

    function divisoria(posicao: number) {
      if (!desenhar) return;

      pdf.setDrawColor(BORDA);
      pdf.line(px(0), py(posicao), px(largura), py(posicao));
    }

    function quebrar(
      valor: string,
      larguraMaxima: number,
      tamanho: number,
      negrito = false,
    ) {
      fonte(tamanho, negrito);
      return pdf.splitTextToSize(valor, larguraMaxima) as string[];
    }

    function secao(numero: string, titulo: string) {
      faixa(y, 7, FUNDO);
      escrever(`${numero}   ${titulo}`, 3, y + 4.8, 10, {
        negrito: true,
        cor: VERDE,
      });
      y += 10;
    }

    function linhaDeCampos(...campos: Campo[]) {
      const preenchidos = campos.filter(([, valor]) => valor?.trim());
      if (preenchidos.length === 0) return;

      const intervalo = 6;
      const coluna = preenchidos.length === 1
        ? largura
        : (largura - intervalo) / 2;
      let maxLinhas = 0;

      preenchidos.forEach(([rotulo, valor], indice) => {
        const x = 3 + indice * (coluna + intervalo);
        const linhas = quebrar(valor, coluna - 6, 9.5);
        maxLinhas = Math.max(maxLinhas, linhas.length);

        escrever(rotulo.toUpperCase(), x, y + 2.4, 7.5, {
          negrito: true,
          cor: CINZA,
        });

        linhas.forEach((linha, i) => {
          escrever(linha, x, y + 6.3 + i * 4, 9.5);
        });
      });

      y += 6 + maxLinhas * 4;
    }

    escrever('Comprovante de reserva', 0, y + 6, 21, {
      negrito: true,
      cor: VERDE,
    });
    y += 12;

    if (r.status === 'cancelada') {
      escrever('RESERVA CANCELADA', 0, y + 3, 9, {
        negrito: true,
        cor: '#9B2D24',
      });
      y += 7;
    }

    secao('01', 'Dados do cliente e do evento');
    linhaDeCampos(['Cliente', r.nome], ['Telefone', r.telefone]);

    linhaDeCampos(
      ['Data e horário do evento', `${dia(r.data)} às ${r.horario.slice(0, 5)}`],
      ['Instagram', r.instagram],
    );

    linhaDeCampos(['Endereço de entrega', endereco(r)]);

    linhaDeCampos(
      ['Condomínio ou prédio', r.condominio],
      ['Apartamento', r.apartamento],
    );

    linhaDeCampos(
      ['Complemento', r.complemento],
      ['Ponto de referência', r.referencia],
    );

    linhaDeCampos([
      'Contato adicional',
      [r.telefone_extra, r.contato, r.parentesco].filter(Boolean).join(' • '),
    ]);

    y += 2;
    secao('02', 'Observações sobre entrega e retirada');

    for (const regra of observacoes) {
      const linhas = quebrar(regra, largura - 12, 9, true);
      escrever('•', 3, y + 3, 9, { negrito: true });

      linhas.forEach((linha, i) => {
        escrever(linha, 8, y + 3 + i * 3.7, 9, { negrito: true });
      });

      y += linhas.length * 3.7 + 2;
    }

    y += 2;
    escrever('Danos ao material locado', 3, y + 3, 9, {
      negrito: true,
      cor: VERDE,
    });
    y += 6;

    const linhasDanos = quebrar(CONDICAO_DANOS, largura - 6, 9, true);
    linhasDanos.forEach((linha, i) => {
      escrever(linha, 3, y + 3 + i * 3.7, 9, { negrito: true });
    });
    y += linhasDanos.length * 3.7 + 2;

    y += 3;
    secao('03', 'Valores da reserva');

    const xItem = 3;
    const xQtd = 83;
    const xUnitario = 127;
    const xValor = 174;
    const rotuloTabela = { negrito: true, cor: CINZA } as const;
    const direita = { alinhar: 'right' } as const;

    escrever('ITEM', xItem, y + 4, 8, rotuloTabela);
    escrever('QTD.', xQtd, y + 4, 8, { ...rotuloTabela, ...direita });
    escrever('UNITÁRIO', xUnitario, y + 4, 8, {
      ...rotuloTabela,
      ...direita,
    });
    escrever('VALOR', xValor, y + 4, 8, { ...rotuloTabela, ...direita });
    y += 6;

    for (const item of itensLocados) {
      const quantidade = r[item.qty];
      const unitario = precos[item.price];

      divisoria(y);
      escrever(item.label, xItem, y + 4.8, 9.5);
      escrever(String(quantidade), xQtd, y + 4.8, 9.5, direita);
      escrever(moeda(unitario), xUnitario, y + 4.8, 9.5, direita);
      escrever(moeda(quantidade * unitario), xValor, y + 4.8, 9.5, direita);
      y += 7;
    }

    divisoria(y);
    y += 2;
    escrever('Subtotal da locação', xItem, y + 4, 9.5);
    escrever(moeda(r.subtotal), xValor, y + 4, 9.5, direita);
    escrever('Frete', xItem, y + 10, 9.5);
    escrever(moeda(r.frete), xValor, y + 10, 9.5, direita);
    y += 14;

    faixa(y, 13, VERDE);
    escrever('TOTAL DA RESERVA', xItem, y + 8.5, 10.5, {
      negrito: true,
      cor: '#FFFFFF',
    });
    escrever(moeda(r.total), xValor, y + 8.5, 14, {
      ...direita,
      negrito: true,
      cor: DOURADO,
    });

    return y + 13;
  }

  const alturaDoCorpo = corpo(false);
  corpo(true, Math.min(1, (limite - topo) / alturaDoCorpo));

  pdf.setDrawColor(BORDA);
  pdf.line(margem, 281, 194, 281);
  fonte(8, false, CINZA);
  pdf.text('Seu Lima Locações', margem, 286);
  pdf.text('1 / 1', 194, 286, { align: 'right' });

  return pdf;
}