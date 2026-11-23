// Datos de demostración: consultorio odontológico ficticio.
// Las fechas se calculan desde "hoy" para que el semáforo siempre muestre casos reales.
import * as C from './core.js';

export function crearDemo(hoy) {
  const db = C.dbVacia();
  const d = (n) => C.addDays(hoy, n);
  db.config.empresa = { nombre: 'Clínica Dental Demo S.A.S.', nit: '900.000.000-1', grupo: '2' };
  db.config.usuario = 'Coordinador de inventario';
  db.config.ubicaciones = ['Bodega principal', 'Consultorio 1', 'Consultorio 2', 'Nevera de insumos'];

  db.proveedores = [
    { id: 'pv1', nit: '900.123.456-7', nombre: 'Dental Andina S.A.S.', contacto: 'Laura Gómez', telefono: '601 555 0101', correo: 'ventas@ejemplo.co', obligadoFacturar: true },
    { id: 'pv2', nit: '830.987.654-1', nombre: 'Distribuciones OdontoSur Ltda.', contacto: 'Carlos Ruiz', telefono: '604 555 0202', correo: 'pedidos@ejemplo.co', obligadoFacturar: true },
    { id: 'pv3', nit: '79.555.222', nombre: 'Proveedor persona natural (no obligado a facturar)', contacto: '', telefono: '', correo: '', obligadoFacturar: false }
  ];

  const P = (id, codigo, nombre, categoria, riesgo, unidad, stockMin, extra) => Object.assign({
    id, codigo, nombre, categoria, riesgo, unidad, stockMin, ubicacion: 'Bodega principal',
    fabricante: 'Fabricante de ejemplo', gtin: '', requiereInvima: categoria !== 'insumo',
    invima: '', invimaVence: '', cadenaFrio: false, vnrUnit: '', activo: true
  }, extra || {});

  db.productos = [
    P('p1', 'RES-A3', 'Resina compuesta tono A3, jeringa 4 g', 'dispositivo', 'IIa', 'jeringa', 10, { invima: 'INVIMA 2021DM-0012345', invimaVence: d(1100), gtin: '07701234500025' }),
    P('p2', 'GUA-NIT-M', 'Guantes de nitrilo talla M, caja x100', 'dispositivo', 'I', 'caja', 15, { invima: 'INVIMA 2019DM-0004567', invimaVence: d(60) }),
    P('p3', 'LID-2E', 'Lidocaína 2 % con epinefrina, caja x50 cartuchos', 'medicamento', 'N/A', 'caja', 4, { invima: 'INVIMA 2020M-0011223', invimaVence: d(800) }),
    P('p4', 'HIP-525', 'Hipoclorito de sodio 5,25 %, frasco 1 L', 'insumo', 'N/A', 'frasco', 6),
    P('p5', 'ION-VID', 'Ionómero de vidrio restaurador, kit', 'dispositivo', 'IIa', 'kit', 3, { invima: 'INVIMA 2022DM-0020001', invimaVence: d(1400) }),
    P('p6', 'AGU-30G', 'Agujas dentales cortas 30G, caja x100', 'dispositivo', 'IIa', 'caja', 5, { invima: 'INVIMA 2018DM-0003210', invimaVence: d(500) }),
    P('p7', 'IMP-410', 'Implante dental 4,1 x 10 mm', 'dispositivo', 'III', 'unidad', 4, { invima: 'INVIMA 2023DM-0031415', invimaVence: d(1600), gtin: '07701234500018' }),
    P('p8', 'ALG-450', 'Alginato de fraguado normal, 450 g', 'dispositivo', 'I', 'bolsa', 5, { invima: 'INVIMA 2020DM-0009988', invimaVence: d(900), vnrUnit: 22000 }),
    P('p9', 'ADH-UNI', 'Adhesivo universal, frasco 5 mL', 'dispositivo', 'IIa', 'frasco', 3, { invima: 'INVIMA 2021DM-0016161', invimaVence: d(1200), cadenaFrio: true, ubicacion: 'Nevera de insumos' }),
    P('p10', 'FRE-DIA', 'Fresas de diamante surtidas, x10', 'dispositivo', 'I', 'paquete', 4, { invima: 'INVIMA 2017DM-0001122', invimaVence: d(700) })
  ];

  const mov = (tipo, fecha, datos, lineas) => {
    const m = Object.assign({ id: C.nuevoId(), tipo, fecha, lineas, creado: fecha + 'T09:00:00', usuario: db.config.usuario }, datos);
    m.num = C.siguienteNumero(db, tipo);
    m.orden = C.siguienteOrden(db);
    db.movimientos.push(m);
    return m;
  };
  const L = (productoId, lote, vence, cantidad, costoUnit) => ({ productoId, lote, vence, cantidad, costoUnit });

  mov('entrada', d(-150), { proveedorId: 'pv1', docTipo: 'FE', docNum: 'FEDA-10231', costosAdic: 45000, nota: 'Compra inicial' }, [
    L('p1', 'RA3-2401', d(150), 24, 38000),
    L('p2', 'GN-7781', d(45), 30, 21000),
    L('p5', 'IV-5520', d(420), 6, 96000),
    L('p8', 'AL-1190', d(-5), 12, 28000),
    L('p10', 'FD-3301', d(900), 10, 52000)
  ]);
  mov('entrada', d(-140), { proveedorId: 'pv2', docTipo: 'FE', docNum: 'OS-58871', costosAdic: 0 }, [
    L('p3', 'LD-24A17', d(520), 8, 118000),
    L('p6', 'AG-9031', d(700), 10, 34000),
    L('p7', 'IM-77120', d(1300), 6, 410000),
    L('p9', 'AU-4410', d(260), 6, 89000)
  ]);
  mov('entrada', d(-130), { proveedorId: 'pv3', docTipo: 'DS', docNum: 'DS-000045', costosAdic: 0, nota: 'Documento soporte: proveedor no obligado a facturar' }, [
    L('p4', 'HS-0525', d(330), 12, 9500)
  ]);
  mov('salida', d(-110), { destinoTipo: 'Consultorio', destino: 'Consultorio 1', responsable: 'Dra. Pérez' }, [
    L('p1', 'RA3-2401', d(150), 6), L('p2', 'GN-7781', d(45), 8), L('p3', 'LD-24A17', d(520), 2), L('p6', 'AG-9031', d(700), 3)
  ]);
  mov('salida', d(-95), { destinoTipo: 'Paciente', destino: 'HC-10482', responsable: 'Dr. Martínez' }, [
    L('p7', 'IM-77120', d(1300), 2), L('p5', 'IV-5520', d(420), 1)
  ]);

  // Cierre del periodo anterior (bloquea cambios hasta esa fecha).
  const cierre = C.prepararCierre(db, d(-90)).cierre;
  db.cierres.push(Object.assign({ id: C.nuevoId(), num: C.siguienteNumero(db, 'cierre'), usuario: db.config.usuario, creado: d(-90) + 'T18:00:00' }, cierre));

  mov('entrada', d(-60), { proveedorId: 'pv1', docTipo: 'FE', docNum: 'FEDA-10587', costosAdic: 30000 }, [
    L('p1', 'RA3-2409', d(480), 12, 39500),
    L('p2', 'GN-8012', d(400), 10, 21500),
    L('p8', 'AL-1260', d(600), 2, 28500)
  ]);
  mov('salida', d(-45), { destinoTipo: 'Consultorio', destino: 'Consultorio 2', responsable: 'Dra. Pérez' }, [
    L('p1', 'RA3-2401', d(150), 8), L('p2', 'GN-7781', d(45), 14), L('p4', 'HS-0525', d(330), 5), L('p9', 'AU-4410', d(260), 2), L('p10', 'FD-3301', d(900), 7)
  ]);
  mov('ajuste', d(-30), { acta: 'ACT-2026-014', autoriza: 'Gerencia administrativa', nota: 'Revisión de bodega' }, [
    Object.assign(L('p2', 'GN-7781', d(45), -1), { causa: 'faltante' })
  ]);
  mov('salida', d(-12), { destinoTipo: 'Paciente', destino: 'HC-11730', responsable: 'Dr. Martínez' }, [
    L('p7', 'IM-77120', d(1300), 1), L('p3', 'LD-24A17', d(520), 1), L('p6', 'AG-9031', d(700), 1)
  ]);
  mov('salida', d(-4), { destinoTipo: 'Consultorio', destino: 'Consultorio 1', responsable: 'Dra. Pérez' }, [
    L('p1', 'RA3-2401', d(150), 4), L('p2', 'GN-7781', d(45), 3), L('p4', 'HS-0525', d(330), 2), L('p8', 'AL-1260', d(600), 1)
  ]);

  for (let i = 10; i >= 0; i--) {
    const fuera = i === 6;
    db.temperaturas.push({
      id: C.nuevoId(), fecha: d(-i) + 'T08:00', ubicacion: 'Nevera de insumos',
      temp: fuera ? 9.1 : [4.2, 4.8, 5.1, 3.9, 4.5, 5.4][i % 6], responsable: 'Auxiliar de odontología',
      nota: fuera ? 'Puerta abierta durante la limpieza' : ''
    });
  }
  db.auditoria.unshift({ ts: new Date().toISOString(), usuario: 'Sistema', accion: 'Datos de demostración', detalle: 'Se cargaron datos de ejemplo.' });
  return db;
}
