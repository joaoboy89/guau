import { hasBlockingContactInfo, hasContactChannelMention } from '@guau/shared';

// Funciones puras de @guau/shared, probadas directo (sin pasar por
// ChatService) — el mismo código lo va a consumir el front para el aviso
// antes de mandar (bloque 2.3), así que esta es la única fuente de verdad
// para las dos superficies.

describe('hasBlockingContactInfo() — nivel 1, bloquea', () => {
  // Los dos ejemplos textuales del prompt de cierre de D1/chat.
  it('detecta un teléfono con los dígitos separados por espacios sueltos', () => {
    expect(hasBlockingContactInfo('hablame 11 53 6 26 9 85')).toBe(true);
  });

  it('NO bloquea "no tengo WhatsApp" — mencionar el canal no es dar un dato', () => {
    expect(hasBlockingContactInfo('Te escribo por aca porque no tengo WhatsApp')).toBe(false);
  });

  it('detecta un teléfono separado por guiones', () => {
    expect(hasBlockingContactInfo('Dale, te paso mi numero: 11-5362-6985')).toBe(true);
  });

  it('detecta un teléfono separado por puntos', () => {
    expect(hasBlockingContactInfo('11.5362.6985 llamame')).toBe(true);
  });

  it('detecta un teléfono sin ningún separador (10 dígitos seguidos)', () => {
    expect(hasBlockingContactInfo('mi numero es 1153626985')).toBe(true);
  });

  it('detecta un teléfono de 11 dígitos', () => {
    expect(hasBlockingContactInfo('mi fijo es 01153626985')).toBe(true);
  });

  // Encontrados en auditoría (2026-08-26): === 10 || === 11 dejaba pasar
  // cualquier corrida MÁS larga, y un número con código de país (+549 + el
  // número, la forma más natural de compartir un contacto argentino) tiene
  // 13 dígitos — pasaba limpio. El umbral se cambió a >= 8.

  it('detecta un teléfono de 12 dígitos con un digito de mas al final', () => {
    expect(hasBlockingContactInfo('mi numero es 11 5362 6985 99')).toBe(true);
  });

  it('detecta un teléfono de 13 dígitos con código de país (+54 9 + número)', () => {
    expect(hasBlockingContactInfo('te paso: 5 4 9 1 1 5 3 6 2 6 9 8 5')).toBe(true);
  });

  it('detecta un fijo de 8 dígitos sin característica', () => {
    expect(hasBlockingContactInfo('el fijo es 4788 3921')).toBe(true);
  });

  // Costo aceptado del piso en 8, a propósito (ver el comentario del
  // umbral en hasBlockingContactInfo): estos dos bloquean aunque no sean
  // datos de contacto, porque son corridas de 8+ dígitos separadas solo
  // por espacios. Quedan escritos como decisión, no como sorpresa el día
  // que alguien los encuentre.

  it('bloquea (a propósito) una lista de fechas que suma 8+ dígitos pegados por espacios', () => {
    expect(hasBlockingContactInfo('los dias 24 25 26 27 no puedo')).toBe(true);
  });

  it('bloquea (a propósito) un código largo separado por un espacio', () => {
    expect(hasBlockingContactInfo('el codigo del portero es 1234 5678')).toBe(true);
  });

  it('detecta un mail', () => {
    expect(hasBlockingContactInfo('escribime a juan.perez@gmail.com')).toBe(true);
  });

  it('detecta un @handle', () => {
    expect(hasBlockingContactInfo('segui a @juanperez99')).toBe(true);
  });

  it('detecta una URL con esquema', () => {
    expect(hasBlockingContactInfo('mandame por https://wa.me/5491153626985')).toBe(true);
  });

  it('detecta un dominio sin esquema (wa.me, instagram.com)', () => {
    expect(hasBlockingContactInfo('mejor por instagram.com/juanperez')).toBe(true);
  });

  it('NO confunde números sueltos de la conversación normal con un teléfono', () => {
    // "10:30" y "45" y "3000" quedan separados por palabras (nunca por solo
    // espacio/punto/guion) — no se juntan en una sola corrida de 8+ dígitos.
    expect(
      hasBlockingContactInfo('dale, nos vemos a las 10:30 y dura 45 minutos, sale 3000'),
    ).toBe(false);
  });

  it('NO bloquea una charla sin ningún dato de contacto', () => {
    expect(hasBlockingContactInfo('tengo 3 perros y 2 gatos en casa, todos buenísimos')).toBe(false);
  });

  it('NO bloquea un mensaje vacío de contacto con números cortos aislados', () => {
    expect(hasBlockingContactInfo('el paseo es de 45 minutos')).toBe(false);
  });
});

describe('hasContactChannelMention() — nivel 2, no bloquea, solo marca', () => {
  it('detecta "WhatsApp" mencionado solo (el caso que nivel 1 no puede bloquear)', () => {
    expect(hasContactChannelMention('Te escribo por aca porque no tengo WhatsApp')).toBe(true);
  });

  it('detecta "instagram" mencionado solo', () => {
    expect(hasContactChannelMention('no tengo instagram tampoco')).toBe(true);
  });

  it('detecta "wasap" (variante sin h)', () => {
    expect(hasContactChannelMention('mejor por wasap')).toBe(true);
  });

  it('no detecta nada en un mensaje sin mención de canal', () => {
    expect(hasContactChannelMention('dale, nos vemos a las 10:30')).toBe(false);
  });
});
