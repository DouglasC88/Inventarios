// Datos de demostración: clínica odontológica ficticia.
// Las fechas se calculan desde "hoy" para que el semáforo siempre muestre casos reales.
import * as C from './core.js';

export const USUARIOS_DEMO = [
  ['admin', 'Administrador general', 'admin', '1234', ''],
  ['supervisor', 'Supervisora de inventario', 'supervisor', '1111', ''],
  ['bodega', 'Almacenista', 'almacenista', '2222', ''],
  ['consultorio1', 'Dra. Pérez (Consultorio 1)', 'consultorio', '3333', 'Consultorio 1'],
  ['contador', 'Contador', 'consulta', '4444', '']
];

export function crearDemo(hoy) {
  const db = C.dbVacia();
  const d = (n) => C.addDays(hoy, n);
  const BP = 'Bodega principal', C1 = 'Consultorio 1', C2 = 'Consultorio 2', NV = 'Nevera de insumos';
  db.config.empresa = { nombre: 'Clínica Dental Demo S.A.S.', nit: '900.000.000-1', grupo: '2' };
  db.config.usuario = 'Administrador general';
  db.bodegas = [
    { id: 'b1', codigo: 'BP', nombre: BP, tipo: 'bodega', responsable: 'Almacenista', sede: 'Sede principal', activa: true, principal: true },
    { id: 'b2', codigo: 'C1', nombre: C1, tipo: 'consultorio', responsable: 'Dra. Pérez', sede: 'Sede principal', activa: true },
    { id: 'b3', codigo: 'C2', nombre: C2, tipo: 'consultorio', responsable: 'Dr. Martínez', sede: 'Sede principal', activa: true },
    { id: 'b4', codigo: 'NV', nombre: NV, tipo: 'nevera', responsable: 'Auxiliar de odontología', sede: 'Sede principal', activa: true }
  ];
  C.sincronizarBodegas(db);
  db.grupos = [
    { id: 'g1', codigo: 'RES', nombre: 'Resinas y adhesivos', descripcion: 'Materiales de restauración directa' },
    { id: 'g2', codigo: 'ANE', nombre: 'Anestésicos', descripcion: 'Anestésicos locales y tópicos' },
    { id: 'g3', codigo: 'BIO', nombre: 'Bioseguridad', descripcion: 'Guantes, tapabocas, campos y barreras' },
    { id: 'g4', codigo: 'IMP', nombre: 'Implantología', descripcion: 'Implantes y componentes protésicos' },
    { id: 'g5', codigo: 'ROT', nombre: 'Instrumental rotatorio', descripcion: 'Fresas y piedras' },
    { id: 'g6', codigo: 'IMR', nombre: 'Impresión', descripcion: 'Alginatos y siliconas' },
    { id: 'g7', codigo: 'DES', nombre: 'Desinfección y endodoncia', descripcion: 'Irrigantes y desinfectantes' },
    { id: 'g8', codigo: 'PRO', nombre: 'Profilaxis', descripcion: 'Cepillos, copas y pastas' },
    { id: 'g9', codigo: 'AGU', nombre: 'Agujas y jeringas', descripcion: 'Agujas dentales y carpules' }
  ];

  db.usuarios = USUARIOS_DEMO.map(([usuario, nombre, rol, pin, bodega]) => ({
    id: 'u-' + usuario, usuario, nombre, rol, bodega, activo: true, pinHash: C.hashPin(usuario, pin)
  }));

  const T = (id, nit, nombre, tipos, extra) => C.normalizarTercero(Object.assign({ id, tipoDoc: 'NIT', nit, dv: C.calcularDV(nit), nombre, tipos, persona: 'juridica', contacto: '', telefono: '', correo: '', direccion: '', ciudad: 'Bogotá D.C.', responsableIva: true, obligadoFacturar: true }, extra || {}));
  db.proveedores = [
    T('pv1', '900123456', 'Dental Andina S.A.S.', ['proveedor'], { contacto: 'Laura Gómez', telefono: '601 555 0101', correo: 'ventas@ejemplo.co', direccion: 'Cra. 15 # 80-20' }),
    T('pv2', '830987654', 'Distribuciones OdontoSur Ltda.', ['proveedor'], { contacto: 'Carlos Ruiz', telefono: '604 555 0202', correo: 'pedidos@ejemplo.co', ciudad: 'Medellín' }),
    T('pv3', '79555222', 'Proveedor persona natural (no obligado a facturar)', ['proveedor'], { tipoDoc: 'CC', dv: '', persona: 'natural', responsableIva: false, obligadoFacturar: false }),
    T('cl1', '901456789', 'Laboratorio Dental Aliado S.A.S.', ['cliente'], { contacto: 'Andrea Ríos', ciudad: 'Bogotá D.C.' }),
    T('pa1', '1020304050', 'Paciente de ejemplo', ['paciente'], { tipoDoc: 'CC', dv: '', persona: 'natural', responsableIva: false, obligadoFacturar: false })
  ];

  const P = (id, codigo, nombre, categoria, riesgo, unidad, stockMin, extra) => Object.assign({
    id, codigo, nombre, categoria, riesgo, unidad, stockMin, ubicacion: BP,
    fabricante: 'Fabricante de ejemplo', gtin: '', requiereInvima: categoria !== 'insumo',
    invima: '', invimaVence: '', cadenaFrio: false, vnrUnit: '', activo: true,
    unidadCompra: '', factorCompra: 1, leadTime: 7, proveedorId: 'pv1'
  }, extra || {});

  db.productos = [
    P('p1', 'RES-A3', 'Resina compuesta tono A3, jeringa 4 g', 'dispositivo', 'IIa', 'jeringa', 10, { invima: 'INVIMA 2021DM-0012345', invimaVence: d(1100), gtin: '07701234500025', unidadCompra: 'caja x6', factorCompra: 6, leadTime: 5, grupoId: 'g1' }),
    P('p2', 'GUA-NIT-M', 'Guantes de nitrilo talla M, caja x100', 'dispositivo', 'I', 'caja', 15, { invima: 'INVIMA 2019DM-0004567', invimaVence: d(60), leadTime: 3, grupoId: 'g3' }),
    P('p3', 'LID-2E', 'Lidocaína 2 % con epinefrina, cartucho 1,8 mL', 'medicamento', 'N/A', 'cartucho', 60, { invima: 'INVIMA 2020M-0011223', invimaVence: d(800), unidadCompra: 'caja x50', factorCompra: 50, proveedorId: 'pv2', leadTime: 10, grupoId: 'g2' }),
    P('p4', 'HIP-525', 'Hipoclorito de sodio 5,25 %, frasco 1 L', 'insumo', 'N/A', 'frasco', 6, { proveedorId: 'pv3', leadTime: 2, grupoId: 'g7' }),
    P('p5', 'ION-VID', 'Ionómero de vidrio restaurador, kit', 'dispositivo', 'IIa', 'kit', 3, { invima: 'INVIMA 2022DM-0020001', invimaVence: d(1400), grupoId: 'g1' }),
    P('p6', 'AGU-30G', 'Aguja dental corta 30G', 'dispositivo', 'IIa', 'unidad', 100, { invima: 'INVIMA 2018DM-0003210', invimaVence: d(500), unidadCompra: 'caja x100', factorCompra: 100, proveedorId: 'pv2', grupoId: 'g9' }),
    P('p7', 'IMP-410', 'Implante dental 4,1 x 10 mm', 'dispositivo', 'III', 'unidad', 4, { invima: 'INVIMA 2023DM-0031415', invimaVence: d(1600), gtin: '07701234500018', proveedorId: 'pv2', leadTime: 15, grupoId: 'g4' }),
    P('p8', 'ALG-450', 'Alginato de fraguado normal, 450 g', 'dispositivo', 'I', 'bolsa', 5, { invima: 'INVIMA 2020DM-0009988', invimaVence: d(900), vnrUnit: 22000, grupoId: 'g6' }),
    P('p9', 'ADH-UNI', 'Adhesivo universal, frasco 5 mL', 'dispositivo', 'IIa', 'frasco', 3, { invima: 'INVIMA 2021DM-0016161', invimaVence: d(1200), cadenaFrio: true, ubicacion: NV, proveedorId: 'pv2', grupoId: 'g1' }),
    P('p10', 'FRE-DIA', 'Fresas de diamante surtidas, x10', 'dispositivo', 'I', 'paquete', 4, { invima: 'INVIMA 2017DM-0001122', invimaVence: d(700), grupoId: 'g5' }),
    P('p11', 'CEP-IMP', 'Cepillo de profilaxis', 'insumo', 'N/A', 'unidad', 40, { unidadCompra: 'bolsa x50', factorCompra: 50, leadTime: 4, grupoId: 'g8' })
  ];

  db.kits = [
    { id: 'k1', codigo: 'KIT-RES2', nombre: 'Resina clase II', lineas: [{ productoId: 'p1', cantidad: 0.25 }, { productoId: 'p3', cantidad: 1 }, { productoId: 'p6', cantidad: 1 }, { productoId: 'p2', cantidad: 0.02 }] },
    { id: 'k2', codigo: 'KIT-IMP', nombre: 'Implante unitario', lineas: [{ productoId: 'p7', cantidad: 1 }, { productoId: 'p3', cantidad: 2 }, { productoId: 'p6', cantidad: 2 }, { productoId: 'p2', cantidad: 0.04 }] },
    { id: 'k3', codigo: 'KIT-PROF', nombre: 'Profilaxis', lineas: [{ productoId: 'p11', cantidad: 1 }, { productoId: 'p2', cantidad: 0.02 }] }
  ];

  const mov = (tipo, fecha, datos, lineas) => {
    const m = Object.assign({ id: C.nuevoId(), tipo, fecha, bodega: BP, lineas, creado: fecha + 'T09:00:00', usuario: 'Almacenista' }, datos);
    m.num = C.siguienteNumero(db, tipo);
    m.orden = C.siguienteOrden(db);
    db.movimientos.push(m);
    C.asegurarLotes(db, m);
    return m;
  };
  const L = (productoId, lote, vence, cantidad, costoUnit) => ({ productoId, lote, vence, cantidad, costoUnit });

  mov('inicial', d(-170), { acta: 'Inventario de apertura', autoriza: 'Gerencia' }, [
    L('p11', 'CP-0100', d(1500), 60, 1200),
    L('p4', 'HS-0400', d(200), 4, 9000)
  ]);

  const oc1 = { id: 'oc1', num: C.siguienteNumero(db, 'orden'), fecha: d(-155), proveedorId: 'pv1', fechaEntrega: d(-150), estado: 'abierta', nota: '', usuario: 'Almacenista', lineas: [
    { productoId: 'p1', cantidad: 24, costoUnit: 38000 }, { productoId: 'p2', cantidad: 30, costoUnit: 21000 }, { productoId: 'p5', cantidad: 6, costoUnit: 96000 },
    { productoId: 'p8', cantidad: 12, costoUnit: 28000 }, { productoId: 'p10', cantidad: 10, costoUnit: 52000 }] };
  db.ordenes.push(oc1);
  mov('entrada', d(-150), { proveedorId: 'pv1', docTipo: 'FE', docNum: 'FEDA-10231', costosAdic: 45000, ordenId: 'oc1', ordenNum: oc1.num, nota: 'Compra inicial' }, [
    L('p1', 'RA3-2401', d(150), 24, 38000),
    L('p2', 'GN-7781', d(45), 30, 21000),
    L('p5', 'IV-5520', d(420), 6, 96000),
    L('p8', 'AL-1190', d(-5), 12, 28000),
    L('p10', 'FD-3301', d(900), 10, 52000)
  ]);
  mov('entrada', d(-140), { proveedorId: 'pv2', docTipo: 'FE', docNum: 'OS-58871', costosAdic: 0 }, [
    L('p3', 'LD-24A17', d(520), 400, 2360),
    L('p6', 'AG-9031', d(700), 1000, 340),
    L('p7', 'IM-77120', d(1300), 6, 410000)
  ]);
  mov('entrada', d(-140), { proveedorId: 'pv2', docTipo: 'FE', docNum: 'OS-58872', costosAdic: 0, bodega: NV }, [
    L('p9', 'AU-4410', d(260), 6, 89000)
  ]);
  mov('entrada', d(-130), { proveedorId: 'pv3', docTipo: 'DS', docNum: 'DS-000045', costosAdic: 0, nota: 'Documento soporte: proveedor no obligado a facturar' }, [
    L('p4', 'HS-0525', d(330), 12, 9500)
  ]);
  mov('traslado', d(-120), { bodegaDestino: C1, responsable: 'Almacenista', nota: 'Dotación inicial' }, [
    L('p1', 'RA3-2401', d(150), 8), L('p2', 'GN-7781', d(45), 10), L('p3', 'LD-24A17', d(520), 100), L('p6', 'AG-9031', d(700), 200), L('p11', 'CP-0100', d(1500), 20)
  ]);
  mov('traslado', d(-120), { bodegaDestino: C2, responsable: 'Almacenista', nota: 'Dotación inicial' }, [
    L('p1', 'RA3-2401', d(150), 6), L('p2', 'GN-7781', d(45), 8), L('p3', 'LD-24A17', d(520), 80), L('p6', 'AG-9031', d(700), 150)
  ]);
  mov('salida', d(-110), { bodega: C1, destinoTipo: 'Paciente', destino: 'HC-10233', procedimiento: 'Resina clase II', responsable: 'Dra. Pérez' }, [
    L('p1', 'RA3-2401', d(150), 1), L('p3', 'LD-24A17', d(520), 2), L('p6', 'AG-9031', d(700), 2)
  ]);
  mov('salida', d(-95), { destinoTipo: 'Paciente', destino: 'HC-10482', procedimiento: 'Implante unitario', responsable: 'Dr. Martínez' }, [
    L('p7', 'IM-77120', d(1300), 2), L('p3', 'LD-24A17', d(520), 4), L('p6', 'AG-9031', d(700), 4)
  ]);
  mov('devolucion', d(-92), { proveedorId: 'pv1', causa: 'calidad', docNum: 'NC-DA-311', nota: 'Empaque abierto' }, [
    L('p5', 'IV-5520', d(420), 1)
  ]);

  const cierre = C.prepararCierre(db, d(-90)).cierre;
  db.cierres.push(Object.assign({ id: C.nuevoId(), num: C.siguienteNumero(db, 'cierre'), usuario: 'Supervisora de inventario', creado: d(-90) + 'T18:00:00' }, cierre));

  const oc2 = { id: 'oc2', num: C.siguienteNumero(db, 'orden'), fecha: d(-65), proveedorId: 'pv1', fechaEntrega: d(-58), estado: 'abierta', nota: '', usuario: 'Almacenista', lineas: [
    { productoId: 'p1', cantidad: 18, costoUnit: 39500 }, { productoId: 'p2', cantidad: 20, costoUnit: 21500 }, { productoId: 'p8', cantidad: 2, costoUnit: 28500 }] };
  db.ordenes.push(oc2);
  mov('entrada', d(-60), { proveedorId: 'pv1', docTipo: 'FE', docNum: 'FEDA-10587', costosAdic: 30000, ordenId: 'oc2', ordenNum: oc2.num }, [
    L('p1', 'RA3-2409', d(480), 12, 39500),
    L('p2', 'GN-8012', d(400), 10, 21500),
    L('p8', 'AL-1260', d(600), 2, 28500)
  ]);
  mov('salida', d(-45), { bodega: C2, destinoTipo: 'Consultorio', destino: 'Consultorio 2', responsable: 'Dr. Martínez' }, [
    L('p1', 'RA3-2401', d(150), 3), L('p2', 'GN-7781', d(45), 5), L('p3', 'LD-24A17', d(520), 30), L('p6', 'AG-9031', d(700), 40)
  ]);
  mov('salida', d(-40), { destinoTipo: 'Servicio', destino: 'Esterilización', responsable: 'Auxiliar' }, [
    L('p4', 'HS-0525', d(330), 5), L('p4', 'HS-0400', d(200), 4), L('p10', 'FD-3301', d(900), 7)
  ]);
  mov('ajuste', d(-30), { acta: 'ACT-2026-014', autoriza: 'Supervisora de inventario', nota: 'Revisión de bodega' }, [
    Object.assign(L('p2', 'GN-7781', d(45), -1), { causa: 'faltante' })
  ]);
  mov('salida', d(-20), { bodega: C1, destinoTipo: 'Paciente', destino: 'HC-11730', procedimiento: 'Profilaxis', responsable: 'Dra. Pérez' }, [
    L('p11', 'CP-0100', d(1500), 1), L('p2', 'GN-7781', d(45), 1)
  ]);
  mov('salida', d(-12), { destinoTipo: 'Paciente', destino: 'HC-11730', procedimiento: 'Implante unitario', responsable: 'Dr. Martínez' }, [
    L('p7', 'IM-77120', d(1300), 1), L('p3', 'LD-24A17', d(520), 2), L('p6', 'AG-9031', d(700), 2)
  ]);
  mov('salida', d(-4), { bodega: C1, destinoTipo: 'Paciente', destino: 'HC-12001', procedimiento: 'Resina clase II', responsable: 'Dra. Pérez' }, [
    L('p1', 'RA3-2401', d(150), 2), L('p3', 'LD-24A17', d(520), 3), L('p6', 'AG-9031', d(700), 3), L('p11', 'CP-0100', d(1500), 2)
  ]);

  db.requisiciones.push({
    id: 'rq1', num: C.siguienteNumero(db, 'requisicion'), fecha: d(-2), bodegaSolicita: C2, bodegaAtiende: BP,
    solicita: 'Dr. Martínez', estado: 'pendiente', nota: 'Agenda de implantes de la próxima semana',
    lineas: [{ productoId: 'p7', cantidad: 2 }, { productoId: 'p2', cantidad: 4 }, { productoId: 'p11', cantidad: 10 }]
  });
  db.ordenes.push({ id: 'oc3', num: C.siguienteNumero(db, 'orden'), fecha: d(-3), proveedorId: 'pv2', fechaEntrega: d(7), estado: 'abierta', nota: 'Reposición de implantes', usuario: 'Almacenista', lineas: [
    { productoId: 'p7', cantidad: 4, costoUnit: 415000 }] });

  const adh = C.buscarLote(db, 'p9', 'AU-4410');
  adh.estado = 'cuarentena';
  adh.motivo = 'Temperatura de 9,1 °C en la nevera; en evaluación antes de liberar';
  for (const l of db.lotes) if (!l.fabricado && l.vence) l.fabricado = C.addDays(l.vence, -730);

  for (let i = 10; i >= 0; i--) {
    const fuera = i === 6;
    db.temperaturas.push({
      id: C.nuevoId(), fecha: d(-i) + 'T08:00', ubicacion: NV,
      temp: fuera ? 9.1 : [4.2, 4.8, 5.1, 3.9, 4.5, 5.4][i % 6], responsable: 'Auxiliar de odontología',
      nota: fuera ? 'Puerta abierta durante la limpieza' : ''
    });
  }
  db.auditoria.unshift({ ts: new Date().toISOString(), usuario: 'Sistema', accion: 'Datos de demostración', detalle: 'Se cargaron datos de ejemplo.' });
  return db;
}
