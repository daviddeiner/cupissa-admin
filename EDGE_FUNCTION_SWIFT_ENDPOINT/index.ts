import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tarifario incorporado desde assets/data/domicilios.json del checkout CUPISSA[cite: 1].
const DOMICILIO_TARIFFS: Record<string, Record<string, number>> = {
  "BARRANQUILLA": { "ABAJO": 13000, "ALBORAYA": 12000, "ALFONSO LOPEZ": 13000, "ALTAMIRA": 15000, "ALTOS DE RIOMAR": 15000, "ALTOS DEL LIMON": 15000, "ALTOS DEL PARQUE": 15000, "ALTOS DEL PRADO": 15000, "ANDALUCIA": 15000, "AMERICA": 15000, "ATLANTICO": 13000, "BARLOVENTO": 13000, "BARRANQUILLITA": 15000, "BELLA ARENA": 10000, "BELLAVISTA": 15000, "BERNARDO HOYOS": 15000, "BETANIA": 15000, "BOSTON": 15000, "BOYACA": 13000, "BUENA ESPERANZA": 13000, "BUENOS AIRES": 12000, "CALIFORNIA": 15000, "CAMPO ALEGRE": 15000, "CARLOS MEISEL": 14000, "CARRIZAL": 10000, "CENTRO": 15000, "CEVILLAR": 10000, "CHIQUINQUIRA": 15000, "CIUDAD MODESTO": 15000, "CIUDAD JARDIN": 15000, "20 DE JULIO": 13000, "CIUDADELA 20 DE JULIO": 10000, "CIUDADELA DE LA SALUD": 15000, "COLINA CAMPESTRE": 15000, "NUEVA COLOMBIA": 15000, "CORDIALIDAD": 14000, "CUCHILLA DE VILLATE": 14000, "LAS DELICIAS": 15000, "EL BOLICHE": 15000, "EL BOSQUE": 13000, "EL CAMPITO": 12000, "EL CARMEN": 15000, "EL CASTILLO": 15000, "EL EDEN": 15000, "EL FERRY": 10000, "EL GOLF": 15000, "EL LIMON": 13000, "EL LIMONCITO": 15000, "EL POBLADO": 15000, "EL PORVENIR": 15000, "EL PRADO": 15000, "EL PUEBLO": 15000, "EL ROMANCE": 15000, "EL RUBI": 15000, "EL SILENCIO": 15000, "EL TABOR": 15000, "EL VALLE": 15000, "EVARISTO SOURDIS": 15000, "GRANADILLO": 15000, "JOSE ANTONIO GALAN": 10000, "JUAN MINA": 20000, "KENNEDY": 13000, "LA CAMPINA": 15000, "LA CEIBA": 12000, "LA CHINITA": 12000, "LA CONCEPCION": 15000, "LA CUMBRE": 15000, "LA ESMERALDA": 15000, "LA FLORESTA": 15000, "LA FLORIDA": 15000, "LA GLORIA": 15000, "LA LIBERTAD": 15000, "LA LUZ": 12000, "LA MAGDALENA": 10000, "LA MANGA": 14000, "LA PAZ": 14000, "LA PRADERA": 15000, "LA SIERRA": 12000, "LA SIERRITA": 12000, "LA UNION": 13000, "LA VICTORIA": 13000, "LAS AMERICAS": 13000, "LAS COLINAS": 15000, "LAS DUNAS": 15000, "LAS ESTRELLAS": 15000, "LAS FLORES": 15000, "LAS GRANJAS": 15000, "LAS MALVINAS": 13000, "LAS MERCEDES": 15000, "LAS NIEVES": 12000, "LAS PALMAS": 12000, "LAS TRES AVEMARIAS": 15000, "LOMA FRESCA": 15000, "LOS ALPES": 15000, "LOS ANDES": 15000, "LOS ANGELES I, II Y III": 15000, "LOS GIRASOLES": 10000, "LOS JOBOS": 15000, "LOS LAURELES": 12000, "LOS NOGALES": 15000, "LOS OLIVOS I": 14000, "LOS OLIVOS II": 14000, "LOS PINOS": 13000, "LOS ROSALES": 15000, "LOS TRUPILLOS": 13000, "LUCERO": 15000, "ME QUEJO": 13000, "MIRAMAR": 15000, "MODELO": 15000, "MONTECRISTO": 15000, "MONTES": 12000, "NUEVA GRANADA": 15000, "NUEVO HORIZONTE": 15000, "OLAYA HERRERA": 13000, "PARAISO": 15000, "PASADENA": 12000, "PASTRANA": 15000, "PINAR DEL RIO": 15000, "PORFIN": 13000, "PORTAL DEL GENOVES": 15000, "PRADOMAR": 20000, "PUMAREJO": 15000, "REBOLO": 12000, "RECREO": 15000, "RIOMAR": 15000, "RINCON DEL SALADO": 15000, "ROSARIO": 15000, "SAN ANTONIO": 12000, "SAN FELIPE": 13000, "SAN FRANCISCO": 15000, "SAN ISIDRO": 13000, "SAN JOSE": 13000, "SAN LUIS": 13000, "SAN NICOLAS": 12000, "SAN PEDRO ALEJANDRINO": 15000, "SAN ROQUE": 15000, "SAN SALVADOR": 15000, "SAN VICENTE": 15000, "SANTA ANA": 13000, "SANTA ELENA": 12000, "SANTA MARIA": 13000, "SANTA MONICA": 15000, "SANTO DOMINGO DE GUZMAN": 12000, "SANTUARIO": 12000, "SIAPE": 18000, "SIETE DE AGOSTO": 14000, "SIMON BOLIVAR": 10000, "TABOR NORTE": 15000, "TAYRONA": 15000, "UNIVERSAL I Y II": 12000, "URBAPLAYA": 20000, "URBANIZACION LA CEIBA": 12000, "URBANIZACION LAS MERCEDES": 15000, "URBANIZACION LOS ANGELES": 15000, "URBANIZACION MIRAMAR II": 15000, "VALLES DE SAN JOSE": 14000, "VILLA BLANCA": 10000, "VILLA CAMPESTRE": 15000, "VILLA CAROLINA": 15000, "VILLA COUNTRY": 15000, "VILLA DEL ESTE": 12000, "VILLA FLOR": 15000, "VILLA ROSARIO": 15000, "VILLA SAN CARLOS": 15000, "VILLA SAN PEDRO I": 15000, "VILLA SAN PEDRO II": 15000, "VILLA SANTOS": 15000, "VILLA SEVILLA": 11000, "VILLA TERESITA": 14000, "VILLATE": 13000, "VIRGINIA": 14000, "ZONA FRANCA": 15000, "ZONA INDUSTRIAL VIA 40": 15000, "SIETE DE ABRIL": 12000 },
  "SOLEDAD": { "LAS GAVIOTAS": 8000, "12 DE OCTUBRE": 10000, "20 DE JULIO": 12000, "ALTOS DE LA METROPOLITA": 12000, "ALTOS DE JESUS": 12000, "ALTOS DE SEVILLA": 12000, "AMERICA": 10000, "ANTONIO NARINO": 10000, "ARBOLEDA": 10000, "BELLO HORIZONTE": 10000, "BELLA MURILLO": 8000, "BONANZA": 12000, "CACHIMBERO": 12000, "CADENA": 10000, "CANTERA": 12000, "CARRETERA CENTRAL": 10000, "CENTENARIO": 10000, "CENTRO": 12000, "CIUDAD BONITA": 12000, "CIUDAD SALITRE": 12000, "CIUDADELA 11 DE NOVIEMBRE": 10000, "CIUDADELA METROPOLITANA I": 12000, "CIUDADELA METROPOLITANA II": 12000, "CIUDADELA METROPOLITANA III": 12000, "COMUNAL": 12000, "COSTA HERMOSA": 10000, "CUCHILLA DE LOS ANGELES": 12000, "DIVINO NINO": 12000, "DON BOSCO IV": 12000, "EL CANAHUATE": 12000, "EL CORTIJO": 10000, "EL ENCANTO": 10000, "EL ESFUERZO": 12000, "EL ESPANTAO": 12000, "EL FERROCARRIL": 12000, "EL MANANTIAL ETAPA 1": 10000, "EL MANANTIAL ETAPA 2": 10000, "EL OASIS": 12000, "EL PARQUE": 8000, "EL PASITO": 10000, "EL PORVENIR": 10000, "EL RIO": 10000, "EL ROBLE": 10000, "EL SANO": 12000, "EL SILENCIO": 12000, "EL TRIUNFO": 10000, "FUNDACION SOCIAL": 11000, "GRANABASTOS": 12000, "HACIENDA SAN JOSE": 12000, "HIPODROMO": 10000, "INEM": 8000, "ISLA ARZA": 11000, "JUAN DOMINGUEZ ROMERO": 10000, "LA CANDELARIA I": 10000, "LA CANDELARIA II": 10000, "LA CENTRAL": 12000, "LA ESPERANZA": 10000, "LA FE": 12000, "LA FLORA": 10000, "LA FLORESTA": 10000, "LA ILUSION": 10000, "LA INMACULADA": 10000, "LA LOMA": 11000, "LA MARIA": 10000, "LA RIVERA": 10000, "LA SOMBRA": 12000, "LA VICTORIA": 10000, "LA VIRGINIA": 11000, "LAS ALIANZA": 11000, "LAS COMETAS": 11000, "LAS COLONIAS": 10000, "LAS MARGARITAS": 9000, "LAS MORAS ETAPA 1": 10000, "LAS MORAS ETAPA 2": 10000, "LAS MORAS NORTE": 10000, "LAS MORAS SUR": 10000, "LAS NUBES": 11000, "LAS TRINITARIAS": 10000, "LOS ALMENDROS ETAPA 1": 10000, "LOS ALMENDROS ETAPA 2": 10000, "LOS ALMENDROS ETAPA 3": 10000, "LOS ANGELES": 12000, "LOS CUSULES": 10000, "LOS CEDROS": 9000, "LOS CORTIJOS": 9000, "LOS ENCINOS": 10000, "LOS LOTEROS": 10000, "LOS MUVDIS": 10000, "LOS NARANJOS": 10000, "LOS OLIVOS": 11000, "LOS ROBLES ETAPA 1": 10000, "LOS ROBLES ETAPA 2": 10000, "LOS ROBLES ETAPA 3": 10000, "LOS SALADOS": 11000, "LOS LAURELES": 10000, "MANUELA BELTRAN": 12000, "MARIA DE LOS ANGELES": 11000, "MORAS OCCIDENTE": 10000, "MUVDI ETAPA 1": 10000, "MUVDI ETAPA 2": 10000, "NEW YORK": 11000, "NORMANDIA": 10000, "NUEVO HORIZONTE": 11000, "NUEVO MILENIO": 11000, "OASIS DE SOLEDAD": 11000, "PORTAL DE LAS MORAS": 10000, "PORTAL DE LOS ALMENDROS": 10000, "PORTAL REAL": 10000, "PRADO DE SOLEDAD": 10000, "PUERTA DE ORO": 12000, "PUMAREJO": 10000, "RENACER": 12000, "RESERVA DE LOS ALMENDROS": 10000, "RINCON DE LAS MORAS": 10000, "SALOMON": 11000, "SALAMANCA": 12000, "SAN ANTONIO": 12000, "SAN BERNARDO IV": 12000, "SAN VICENTE DE PAUL": 10000, "SANTA INES": 10000, "SAN FERNANDO": 10000, "SANTA ISABEL": 10000, "SOLEDAD 2000 SECTOR A": 10000, "SOLEDAD 2000 SECTOR B": 10000, "SOLEDAD 2000 SECTOR C": 10000, "TAJAMAR I": 12000, "TAJAMAR II": 12000, "TERMINAL DE TRANSPORTES SECTOR": 10000, "TIERRA FIRME": 11000, "URBANIZACION EL PARQUE": 8000, "URBANIZACION EL RIO": 10000, "URBANIZACION LA ARBOLEDA": 10000, "URBANIZACION LA MUVDI": 10000, "URBANIZACION LAS MORAS": 10000, "URBANIZACION LOS ROBLES": 10000, "URBANIZACION PORVENIR": 10000, "URBANIZACION SALAMANCA": 12000, "URBANIZACION SAN ANTONIO": 12000, "URBANIZACION LOS ALMENDROS": 12000, "URBANIZACION VILLA MUVDI": 12000, "VIA AEROPUERTO SECTOR": 12000, "VILLA ADELA I": 10000, "VILLA ADELA II": 10000, "VILLA ALAMEDA": 11000, "VILLA ANGELITA": 10000, "VILLA BELLA": 11000, "VILLA CARMEN I": 9000, "VILLA CARMEN II": 9000, "VILLA CLAVELLINAS": 11000, "VILLA DE LAS MORAS": 10000, "VILLA DEL CARMEN": 8000, "VILLA DEL REY ETAPA 1": 12000, "VILLA DEL REY ETAPA 2": 12000, "VILLA DEL ROSARIO": 10000, "VILLA ESTEFANIA": 10000, "VILLA ESTADIO I": 10000, "VILLA ESTADIO II": 10000, "VILLA KAROLINA": 10000, "VILLA KATANGA I": 10000, "VILLA KATANGA II": 10000, "VILLA KEYLA": 11000, "VILLA LAURA": 11000, "VILLA LIDIA": 10000, "VILLA MARIA": 11000, "VILLA MARVAL": 9000, "VILLA MERLY": 9000, "VILLA MUVDI I": 12000, "VILLA MUVDI II": 12000, "VILLA MURILLO": 10000, "VILLA PLAZA": 10000, "VILLA ROSA": 11000, "VILLA SAN MUELLE": 11000, "VILLA SANTA": 10000, "VILLA SEVERA": 11000, "VILLA SOLEDAD": 10000, "VILLA SOL": 12000, "VILLA VALERY": 12000, "VILLA VENECIA": 12000, "VINAS DEL REY": 12000, "VISTA HERMOSA": 10000, "ZARABANDA": 12000 },
  "MALAMBO": { "BARRIO ABAJO": 15000, "BELLAVISTA": 15000, "BRISAS DEL RIO": 15000, "CAMPO MAGDALENA": 15000, "CARACOLI": 15000, "CARRIZAL (MALAMBO)": 15000, "CENTRO (MALAMBO)": 15000, "CIUDAD BELEN": 15000, "CIUDAD CARIBE I": 15000, "CIUDAD CARIBE II": 15000, "CIUDADELA REAL DEL CARIBE": 15000, "EL CONCORDE SECTOR A": 15000, "EL CONCORDE SECTOR B": 15000, "EL CARMEN": 15000, "EL EDEN": 15000, "EL ESFUERZO (MALAMBO)": 15000, "EL MONTON": 15000, "EL PASITO (MALAMBO)": 15000, "JUAN XXIII": 15000, "LA POPA": 15000, "LA MILAGROSA": 15000, "LLUVIA DE ORO": 15000, "LOS MANGOS": 15000, "LOS MANGUITOS": 15000, "LUNA DE MALAMBO": 15000, "MACROCENTRO INDUSTRIAL": 15000, "MESOLANDIA": 15000, "MONTECARLO": 15000, "PARQUE INDUSTRIAL PIMSA": 15000, "PRADITO": 15000, "SAN FERNANDO": 15000, "SAN JORGE": 15000, "SAN JOSE (MALAMBO)": 15000, "SAN MARTIN (MALAMBO)": 15000, "SANTA MAGDALENA": 15000, "VIA BATALLON VERGARA": 15000, "VILLA AIDA": 15000, "VILLA CAMPO": 15000, "VILLA CONCORD I": 15000, "VILLA CONCORD II": 15000, "VILLA ESTHER": 15000, "VILLA PARAISO": 15000, "VILLA RICA I": 15000, "VILLA RICA II": 15000, "VILLA SOLA": 15000 },
  "PUERTO COLOMBIA": { "ALTO DE LA RISOTA": 30000, "BRAVITO": 30000, "CAUJARAL / CLUB CAMPESTRE": 30000, "CENTRO (PUERTO COLOMBIA)": 30000, "CORREDOR UNIVERSITARIO": 30000, "EL CARMEN (PUERTO)": 30000, "EL MUELLE": 30000, "LA MANGUITA": 30000, "LA RISOTA": 30000, "LOMA DE ORO": 30000, "PASTRANA (PUERTO)": 30000, "PRADOMAR BEACH": 30000, "PUNTA ROCA": 30000, "SABANILLA CASCO": 30000, "SABANILLA COUNTRY CLUB": 30000, "SALGAR CASCO URBANO": 30000, "SALGAR CASTILLO SECTOR": 30000, "SALGAR PLAYAS": 30000, "SAN ANTONIO (PUERTO)": 30000, "SAN CARLOS": 30000, "UNISABANILLA SECTOR": 30000, "VILLA CAMPESTRE NORTE": 30000, "VILLA DE LA PLAYA": 30000, "VILLA DEL MAR (PUERTO)": 30000, "VILLA ROSARIO (PUERTO)": 30000, "VILLA SALGAR": 30000, "VISTAMAR": 30000, "ZONA HOTELERA PRADOMAR": 30000 },
  "GALAPA": { "ALFONSO LOPEZ (GALAPA)": 15000, "CENTRO (GALAPA)": 15000, "EL CARMEN (GALAPA)": 15000, "LA CANDELARIA (GALAPA)": 15000, "LA ESPERANZA": 15000, "LOS ALMENDROS (GALAPA)": 15000, "LOS CARRUAJES": 15000, "MUNDO FELIZ SECTOR A": 15000, "MUNDO FELIZ SECTOR B": 15000, "PUEBLITO VIEJO": 15000, "SALON AZUL": 15000, "SAN ANTONIO (GALAPA)": 15000, "SAN FRANCISCO (GALAPA)": 15000, "SAN MARTIN": 15000, "SAN ROQUE (GALAPA)": 15000, "SANTA CRUZ": 15000, "VILLA OLIMPIA": 15000, "VILLA SELENE ETAPA 1": 15000, "VILLA SELENE ETAPA 2": 15000, "ZAMBRANO SECTOR 1": 15000, "ZAMBRANO SECTOR 2": 15000, "ZONA INDUSTRIAL GALAPA": 15000 },
  "LA PLAYA": { "ADELITA DE CHAR SECTOR 1": 18000, "ADELITA DE CHAR SECTOR 2": 18000, "ADELITA DE CHAR SECTOR 3": 18000, "EDUARDO SANTOS SECTOR BAJO": 18000, "EDUARDO SANTOS SECTOR CENTRAL": 18000, "LA PLAYA SECTOR CENTRAL": 18000, "MARATEA SECTOR A": 18000, "MARATEA SECTOR B": 18000, "PESCADORES SECTOR 1": 18000, "PESCADORES SECTOR 2": 18000, "VILLA DEL MAR (LA PLAYA)": 18000, "VILLA ESPERANZA (LA PLAYA)": 18000, "VILLA POLITA SECTOR 1": 18000, "VILLA POLITA SECTOR 2": 18000 },
};

function normalizeLocationText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleUpperCase("es-CO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

const LOCAL_CITY_MAXIMUM: Record<string, number> = {
  "BARRANQUILLA": 15000,
  "SOLEDAD": 12000,
  "MALAMBO": 15000,
  "GALAPA": 15000,
  "LA PLAYA": 18000,
  "PUERTO COLOMBIA": 30000,
};

function calculateDeliveryQuote(customer: any) {
  const city = normalizeLocationText(customer?.ciudad);
  const neighborhood = normalizeLocationText(customer?.barrio);

  if (!city) {
    throw new Error("Selecciona o escribe la ciudad/municipio de entrega.");
  }

  if (!neighborhood) {
    throw new Error("Selecciona o escribe el barrio de entrega.");
  }

  const cityRates = DOMICILIO_TARIFFS[city];

  if (!cityRates) {
    return {
      city,
      neighborhood,
      fee: 0,
      national: true,
      status: "NATIONAL_TO_QUOTE",
      message: "Envío nacional: el valor del envío será incluido en el total a cancelar al momento de recibir.",
    };
  }

  const registeredFee = cityRates[neighborhood];

  if (Number.isFinite(Number(registeredFee))) {
    return {
      city,
      neighborhood,
      fee: Math.min(LOCAL_CITY_MAXIMUM[city] ?? Infinity, Math.max(0, Number(registeredFee))),
      national: false,
      status: "LOCAL_REGISTERED",
      message: "Domicilio local calculado con el tarifario CUPISSA.",
    };
  }

  const fallback = LOCAL_CITY_MAXIMUM[city] ?? Math.max(...Object.values(cityRates));

  return {
    city,
    neighborhood,
    fee: Number.isFinite(fallback) ? fallback : 0,
    national: false,
    status: "LOCAL_OTHER_NEIGHBORHOOD",
    message: "Domicilio local: barrio no registrado; se aplica la tarifa máxima registrada para el municipio.",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!key) {
    try {
      const secretKeys = JSON.parse(
        Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"
      );
      key = secretKeys.default || Object.values(secretKeys)[0] || "";
    } catch (_) {}
  }

  if (!url || !key) {
    throw new Error(
      "Falta la clave administrativa de Supabase en el entorno de Edge Functions."
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizePhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(-10);
}

function parseArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      return Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object"
          ? [parsed]
          : [];
    } catch {
      return /^https?:\/\//i.test(value) ? [value] : [];
    }
  }

  return [];
}

function optionExtra(options: unknown, selected: string) {
  if (!selected) return 0;

  const found = parseArray(options).find(
    (option) =>
      String(option?.nombre ?? option?.name ?? "") === selected
  );

  if (!found) {
    throw new Error(
      `La opción ${selected} ya no está disponible. Actualiza el carrito.`
    );
  }

  return Number(found.incremento ?? found.adicional ?? 0);
}

async function authenticateLegacyClient(
  db: any,
  clientId: string,
  password: string
) {
  if (!clientId || !password) {
    throw new Error(
      "Inicia sesión en tu cuenta CUPISSA para continuar."
    );
  }

  const { data, error } = await db
    .from("clientes")
    .select("*")
    .eq("id", clientId)
    .eq("password", password)
    .maybeSingle();

  if (error) {
    throw new Error(
      "No fue posible validar tu sesión CUPISSA."
    );
  }

  if (!data) {
    throw new Error(
      "Tu sesión expiró. Inicia sesión nuevamente."
    );
  }

  return data;
}

function dateKeyInBogota(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(key: string, count: number) {
  const [year, month, day] = key.split("-").map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day + count, 12)
  );

  return `${date.getUTCFullYear()}-${String(
    date.getUTCMonth() + 1
  ).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function weekday(key: string) {
  const [year, month, day] = key.split("-").map(Number);

  return new Date(
    Date.UTC(year, month - 1, day, 12)
  ).getUTCDay();
}

function easterDate(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;

  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);

  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;

  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;

  const m = Math.floor((a + 11 * h + 22 * l) / 451);

  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return `${year}-${String(month).padStart(2, "0")}-${String(
    day
  ).padStart(2, "0")}`;
}

function moveToMonday(key: string) {
  const day = weekday(key);

  return day === 1
    ? key
    : addDays(key, (8 - day) % 7 || 7);
}

function colombianHolidays(year: number) {
  const holidays = new Set<string>([
    `${year}-01-01`,
    `${year}-05-01`,
    `${year}-07-20`,
    `${year}-08-07`,
    `${year}-12-08`,
    `${year}-12-25`,
  ]);

  [
    `${year}-01-06`,
    `${year}-03-19`,
    `${year}-06-29`,
    `${year}-08-15`,
    `${year}-10-12`,
    `${year}-11-01`,
    `${year}-11-11`,
  ].forEach((date) => holidays.add(moveToMonday(date)));

  const easter = easterDate(year);

  holidays.add(addDays(easter, -3));
  holidays.add(addDays(easter, -2));

  [39, 60, 68].forEach((days) =>
    holidays.add(moveToMonday(addDays(easter, days)))
  );

  return holidays;
}

function isBlockedDate(key: string) {
  return (
    weekday(key) === 0 ||
    colombianHolidays(Number(key.slice(0, 4))).has(key)
  );
}

function isValidDateKey(key: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;

  const [year, month, day] = key.split("-").map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day, 12)
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function calculateEarliestDelivery(
  preparationDays: number,
  today = dateKeyInBogota()
) {
  let candidate = today;
  let remaining = Math.max(0, Math.floor(preparationDays));

  if (remaining > 0) {
    candidate = addDays(candidate, 1);

    while (remaining > 0) {
      if (!isBlockedDate(candidate)) remaining--;
      candidate = addDays(candidate, 1);
    }
  }

  while (isBlockedDate(candidate) || candidate < today) {
    candidate = addDays(candidate, 1);
  }

  return candidate;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getNestedValue(source: any, path: string) {
  return path.split(".").reduce(
    (value: any, key: string) =>
      value == null ? undefined : value[key],
    source
  );
}

function safeEqualText(left: string, right: string) {
  if (left.length !== right.length) return false;

  let difference = 0;

  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}

async function verifyWompiEventSignature(
  body: any,
  headerChecksum: string | null
) {
  const eventsSecret = (Deno.env.get("WOMPI_EVENTS_SECRET") || "").trim();
  const properties = body?.signature?.properties;
  const timestamp = body?.timestamp;

  const received = String(
    headerChecksum || body?.signature?.checksum || ""
  ).trim().toLowerCase();

  if (
    !eventsSecret ||
    !Array.isArray(properties) ||
    properties.length === 0 ||
    !Number.isFinite(Number(timestamp)) ||
    !received
  ) {
    return false;
  }

  const values: string[] = [];

  for (const property of properties) {
    const path = String(property);

    const value =
      getNestedValue(body?.data, path) ??
      getNestedValue(body, path);

    if (value === undefined || value === null) {
      return false;
    }

    values.push(String(value));
  }

  const expected = (
    await sha256Hex(
      `${values.join("")}${timestamp}${eventsSecret}`
    )
  ).toLowerCase();

  return safeEqualText(expected, received);
}

async function verifyWompiTransaction(transactionId: string) {
  const privateKey = (Deno.env.get("WOMPI_PRIVATE_KEY") || "").trim();

  if (!privateKey) {
    throw new Error(
      "No está disponible la clave privada Wompi para consultar la transacción."
    );
  }

  const isSandbox =
    privateKey.startsWith("prv_test_") ||
    Deno.env.get("WOMPI_ENVIRONMENT") === "sandbox";

  const baseUrl = isSandbox
    ? "https://sandbox.wompi.co/v1"
    : "https://production.wompi.co/v1";

  const response = await fetch(
    `${baseUrl}/transactions/${encodeURIComponent(transactionId)}`,
    {
      headers: {
        Authorization: `Bearer ${privateKey}`,
        Accept: "application/json",
      },
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.data) {
    throw new Error(
      payload?.error?.reason ||
      "No fue posible consultar la transacción directamente con Wompi."
    );
  }

  return payload.data;
}


// -----------------------------------------------------
// PAGOS DE CRÉDITO (referencias CRED-)
// Se procesa desde el mismo webhook para no alterar la ruta CUPWEB-.
// -----------------------------------------------------
const CREDIT_PAID_STATE = "PAGADO";
const CREDIT_FREQ_COLUMN = "frecuencia";
const CREDIT_LOCK_MINUTES = 2;

function creditDaysInMonth(year: number, month1: number) {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function creditDateFormat(year: number, month1: number, day: number) {
  return new Date(Date.UTC(year, month1 - 1, day)).toISOString().slice(0, 10);
}

function creditNextDueDate(current: string, frequency?: string | null) {
  const [year, month, day] = String(current).split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error("Fecha de próximo pago inválida en el crédito.");
  }

  const f = String(frequency || "Mensual")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase();

  if (f.includes("diari")) return creditDateFormat(year, month, day + 1);
  if (f.includes("seman")) return creditDateFormat(year, month, day + 7);

  if (f.includes("quinc") || f.includes("15 dia") || f.includes("cada 15")) {
    if (day <= 15) {
      return creditDateFormat(year, month, Math.min(day + 15, creditDaysInMonth(year, month)));
    }
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return creditDateFormat(nextYear, nextMonth, Math.min(day - 15, creditDaysInMonth(nextYear, nextMonth)));
  }

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return creditDateFormat(nextYear, nextMonth, Math.min(day, creditDaysInMonth(nextYear, nextMonth)));
}

function buildCreditPaymentUpdates(credits: any[], type: "min" | "tot") {
  let cupoDelta = 0;
  const updates = credits.map((credit: any) => {
    const debt = Number(credit.deuda_actual || 0);
    const installment = type === "tot"
      ? debt
      : Math.min(Number(credit.valor_cuota || 0), debt);
    const newDebt = Math.round(Math.max(0, debt - installment) * 100) / 100;
    const paid = newDebt <= 0.009;
    cupoDelta += installment;

    let due = credit.proximo_vencimiento ?? "";
    if (paid) due = "";
    else if (installment > 0 && credit.proximo_vencimiento) {
      due = creditNextDueDate(credit.proximo_vencimiento, credit[CREDIT_FREQ_COLUMN]);
    }

    return {
      id: String(credit.id),
      deuda_actual: paid ? 0 : newDebt,
      estado: paid ? CREDIT_PAID_STATE : credit.estado,
      proximo_vencimiento: due,
    };
  });

  return { updates, cupoDelta: Math.round(cupoDelta) };
}

async function processCreditWompiTransaction(db: any, transaction: any) {
  const reference = String(transaction.reference || "");
  const transactionId = String(transaction.id || "");
  const transactionStatus = String(transaction.status || "PENDING").toUpperCase();

  const { data: payment, error: paymentError } = await db
    .from("pagos_credito")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();

  if (paymentError) throw paymentError;
  if (!payment) {
    throw new Error(`No existe el registro de pagos_credito para ${reference}.`);
  }

  if (
    Number(transaction.amount_in_cents) !== Number(payment.amount_in_cents) ||
    String(transaction.currency || "") !== "COP"
  ) {
    throw new Error("El monto o la moneda del pago de crédito no coincide con el registro.");
  }

  if (payment.aplicado) {
    return { status: "APPROVED", duplicate: true, reference };
  }

  if (["DECLINED", "ERROR", "VOIDED"].includes(transactionStatus)) {
    const { error } = await db
      .from("pagos_credito")
      .update({
        estado: transactionStatus,
        wompi_transaction_id: transactionId,
        locked_at: null,
      })
      .eq("reference", reference)
      .eq("aplicado", false);
    if (error) throw error;
    return { status: transactionStatus, processed: true, reference };
  }

  if (transactionStatus !== "APPROVED") {
    return { status: transactionStatus, processed: false, reference };
  }

  const cutoff = new Date(Date.now() - CREDIT_LOCK_MINUTES * 60_000).toISOString();
  const { data: locked, error: lockError } = await db
    .from("pagos_credito")
    .update({ locked_at: new Date().toISOString() })
    .eq("reference", reference)
    .eq("aplicado", false)
    .or(`locked_at.is.null,locked_at.lt.${cutoff}`)
    .select("reference");

  if (lockError) throw lockError;
  if (!locked?.length) {
    return { status: "PENDING", detail: "Otro proceso está aplicando este pago.", reference };
  }

  try {
    const { data: credits, error: creditsError } = await db
      .from("creditos")
      .select("*")
      .eq("cliente_id", String(payment.cliente_id))
      .eq("estado", "ACTIVO");

    if (creditsError) throw creditsError;

    const activeCredits = (credits || [])
      .filter((credit: any) => Number(credit.deuda_actual || 0) > 0.009)
      .sort((a: any, b: any) =>
        String(a.proximo_vencimiento || "9999-12-31")
          .localeCompare(String(b.proximo_vencimiento || "9999-12-31"))
      );

    if (!activeCredits.length) {
      throw new Error("No hay créditos activos pendientes para aplicar este abono.");
    }

    const type = payment.tipo === "tot" ? "tot" : "min";
    const { updates, cupoDelta } = buildCreditPaymentUpdates(activeCredits, type);

    const { error: rpcError } = await db.rpc("aplicar_pago_credito", {
      p_reference: reference,
      p_transaction_id: transactionId,
      p_updates: updates,
      p_cupo_delta: cupoDelta,
    });

    if (rpcError) throw rpcError;

    return { status: "APPROVED", processed: true, reference };
  } catch (error) {
    await db.from("pagos_credito")
      .update({ locked_at: null })
      .eq("reference", reference)
      .eq("aplicado", false);
    throw error;
  }
}

// -----------------------------------------------------
// CREAR COBRO PARA PEDIDO AGENDADO
// -----------------------------------------------------

async function createWebPayment(db: any, body: any) {
  const legacy = await authenticateLegacyClient(
    db,
    String(body.clientId || ""),
    String(body.clientPassword || "")
  );

  const customer = body.customer || {};

  const required = [
    "nombres",
    "apellidos",
    "correo",
    "telefono",
    "direccion",
    "ciudad",
    "barrio",
  ];

  for (const field of required) {
    if (!String(customer[field] || "").trim()) {
      return json(
        { error: `El campo ${field} es obligatorio.` },
        400
      );
    }
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      String(customer.correo)
    )
  ) {
    return json({ error: "El correo no es válido." }, 400);
  }

  if (normalizePhone(customer.telefono).length < 7) {
    return json({ error: "El teléfono no es válido." }, 400);
  }

  let deliveryQuote: ReturnType<typeof calculateDeliveryQuote>;

  try {
    deliveryQuote = calculateDeliveryQuote(customer);
  } catch (deliveryError) {
    return json(
      {
        error: deliveryError instanceof Error
          ? deliveryError.message
          : "No fue posible calcular el domicilio.",
      },
      400
    );
  }

  const shippingFee = deliveryQuote.national ? 0 : deliveryQuote.fee;

  const clientShippingValues = [
    body.clientShipping,
    customer.domicilio_valor,
  ].filter((value) => value !== undefined && value !== null);

  for (const value of clientShippingValues) {
    const receivedShipping = Number(value);

    if (
      !Number.isFinite(receivedShipping) ||
      receivedShipping < 0 ||
      Math.abs(receivedShipping - shippingFee) > 1
    ) {
      return json(
        {
          error:
            "El valor del domicilio cambió. Actualiza la ciudad y el barrio antes de continuar.",
        },
        409
      );
    }
  }

  if (
    deliveryQuote.national &&
    (body.clientShipping != null && Number(body.clientShipping) !== 0)
  ) {
    return json(
      { error: "El envío nacional se cotiza y se paga al recibir el pedido." },
      409
    );
  }

  const items = Array.isArray(body.items) ? body.items : [];

  if (!items.length) {
    return json({ error: "El carrito está vacío." }, 400);
  }

  const productIds = [
    ...new Set(
      items
        .map((item: any) => String(item.productId || ""))
        .filter(Boolean)
    ),
  ];

  if (!productIds.length) {
    return json(
      { error: "No se encontraron productos válidos en el carrito." },
      400
    );
  }

  const { data: products, error: productError } = await db
    .from("productos")
    .select("*")
    .in("id", productIds)
    .eq("oculto", false);

  if (productError) {
    throw new Error(
      "No fue posible validar los productos actuales del catálogo."
    );
  }

  const productMap = new Map(
    (products || []).map((product: any) => [
      String(product.id),
      product,
    ])
  );

  if (productMap.size !== productIds.length) {
    return json(
      {
        error:
          "Uno o más productos ya no están disponibles. Actualiza tu carrito.",
      },
      400
    );
  }

  // Calcular cantidades acumuladas por producto y modalidad ANTES de fijar precios.
  // Las variantes de talla/color de un mismo producto suman para mayorista.
  const quantityByProductMode = new Map<string, number>();
  for (const item of items) {
    const productId = String(item.productId || "");
    const mode = String(item.modalidad || "VENTA").toUpperCase();
    const key = `${productId}::${mode}`;
    const quantity = Math.floor(Number(item.cantidad || 1));
    if (!productId || !["VENTA", "ALQUILER"].includes(mode) ||
        !Number.isFinite(quantity) || quantity < 1 || quantity > 50) {
      return json({ error: "Un producto tiene cantidad o modalidad inválida." }, 400);
    }
    quantityByProductMode.set(key, (quantityByProductMode.get(key) || 0) + quantity);
  }

  const rentalDays = Math.max(
    1,
    Math.min(5, Math.floor(Number(body.rentalDays || 1)))
  );

  const rentalFactor = 1 + (rentalDays - 1) * 0.5;

  // CUPISSA Tareas: el invitado NO recibe descuento. El invitador solo
  // obtiene un cupón del 20 % tras 20 aceptaciones, por 7 días y una compra.
  let rewardUserId = "";
  let referralDiscount = false;
  const { data: byLegacyAccount } = await db.from("clientes_web")
    .select("auth_user_id").eq("cliente_id",String(legacy.id))
    .not("auth_user_id","is",null).limit(1).maybeSingle();
  // Nunca aceptar el correo introducido en el formulario como prueba de identidad.
  if (byLegacyAccount?.auth_user_id) {
    rewardUserId = String(byLegacyAccount.auth_user_id);
    const { data: reward } = await db.from("cupissa_referidos")
      .select("premio_vence_en,premio_usado_en,premio_referencia")
      .eq("auth_user_id",rewardUserId).maybeSingle();
    if (reward && !reward.premio_usado_en && !reward.premio_referencia &&
        Date.parse(String(reward.premio_vence_en || "")) > Date.now()) {
      const {count} = await db.from("cupissa_referidos")
        .select("auth_user_id",{count:"exact",head:true}).eq("invitado_por",rewardUserId);
      referralDiscount = Number(count || 0)>=20;
    }
  }

  const saleLines: any[] = [];
  const rentalLines: any[] = [];

  let saleTotal = 0;
  let saleAdvance = 0;
  let rentalTotal = 0;
  let rentalDepositTotal = 0;
  let rentalAdvance = 0;

  let saleUnits = 0;
  let longestPreparation = 0;
  const expressRequested = body.express === true;
  const totalUnitsByProduct = new Map<string,number>();
  for(const item of items){
    const id=String(item.productId);totalUnitsByProduct.set(id,(totalUnitsByProduct.get(id)||0)+Number(item.cantidad||1));
  }
  if(expressRequested && (!items.some((item:any)=>String(item.modalidad||'VENTA').toUpperCase()!=='ALQUILER') ||
    !items.filter((item:any)=>String(item.modalidad||'VENTA').toUpperCase()!=='ALQUILER').every((item:any)=>productMap.get(String(item.productId))?.produccion_express===true))){
    return json({error:'Uno de los productos no está habilitado para producción express.'},400);
  }

  for (const item of items) {
    const product = productMap.get(
      String(item.productId)
    ) as any;

    const mode = String(
      item.modalidad || "VENTA"
    ).toUpperCase();

    if (!["VENTA", "ALQUILER"].includes(mode)) {
      return json(
        { error: "La modalidad de un producto no es válida." },
        400
      );
    }

    const quantity = Math.floor(
      Number(item.cantidad || 1)
    );

    if (
      !Number.isFinite(quantity) ||
      quantity < 1 ||
      quantity > 50
    ) {
      return json(
        { error: "La cantidad debe estar entre 1 y 50 unidades." },
        400
      );
    }

    const rental = mode === "ALQUILER";

    const rentalEnabled =
      product.alquiler === true ||
      product.alquiler === 1 ||
      product.alquiler === "1" ||
      String(product.alquiler || "").toLowerCase() === "true";

    if (
      rental &&
      (!rentalEnabled || !(Number(product.precio_alquiler || 0) > 0))
    ) {
      return json(
        { error: `${product.nombre} no tiene alquiler disponible.` },
        400
      );
    }

    let initialUnit = rental
      ? Number(product.precio_alquiler || 0)
      : Number(
          product.precio_detal ||
          product.precio ||
          product.price ||
          0
        );

    // Venta al por mayor: respetar cantidad agregada de todas las variantes.
    // No se aplica a ALQUILER; los incrementos de talla/color/accesorios se mantienen.
    const wholesaleQuantity = quantityByProductMode.get(
      `${String(item.productId)}::${mode}`
    ) || quantity;
    const minimumWholesale = Number(product.cant_min_mayorista || 0);
    if (mode !== "ALQUILER" && minimumWholesale > 0 &&
        wholesaleQuantity >= minimumWholesale &&
        Number(product.precio_mayorista || 0) > 0) {
      initialUnit = Number(product.precio_mayorista);
    }

    if (!rental) initialUnit += optionExtra(
      product.tallas,
      String(item.talla || "")
    );

    initialUnit += optionExtra(
      product.colores,
      String(item.color || "")
    );

    initialUnit += optionExtra(
      product.accesorios,
      String(item.accesorio || "")
    );

    if (!Number.isFinite(initialUnit) || initialUnit <= 0) {
      return json(
        {
          error: `El precio de ${product.nombre || "un producto"} no es válido.`,
        },
        400
      );
    }

    const regularUnit = Math.round(
      initialUnit * (rental ? rentalFactor : 1)
    );
    const unit = referralDiscount ? Math.round(regularUnit * 0.8) : regularUnit;

    const lineTotal = Math.round(unit * quantity);

    const percentage = Math.max(
      0,
      Math.min(100, Number(product.porcentaje_anticipo || 20))
    );

    const codEligible = product.pago_contraentrega===true &&
      (totalUnitsByProduct.get(String(product.id))||0)<6 &&
      (totalUnitsByProduct.get(String(product.id))||0)<Math.max(1,Number(product.cant_min_mayorista||6));
    const lineAdvance = codEligible ? 0 : Math.round(lineTotal * percentage / 100);

    const photos = parseArray(product.fotos)
      .filter(
        (url) =>
          typeof url === "string" &&
          /^https?:\/\//i.test(url)
      )
      .slice(0, 6);

    const line = {
      producto_id: String(product.id),
      nombre: String(
        product.nombre ||
        item.nombre ||
        "Producto CUPISSA"
      ),
      modalidad: mode,
      cantidad: quantity,
      talla: String(item.talla || ""),
      color: String(item.color || ""),
      accesorio: String(item.accesorio || ""),
      referencia: String(
        item.customText ||
        product.referencia ||
        product.referencia_producto ||
        ""
      ),
      precio_inicial: initialUnit,
      precio: unit,
      precio_unitario: unit,
      total: lineTotal,
      anticipo_calculado: lineAdvance,
      dias_alquiler: rental ? rentalDays : 0,
      deposito_alquiler: rental
        ? Math.max(0, Number(product.valor_deposito || 0)) * quantity
        : 0,
      imagen_url: photos[0] || "",
      imagenes: photos,
    };

    if (rental) {
      rentalTotal += lineTotal;
      rentalDepositTotal += line.deposito_alquiler;
      rentalAdvance += lineAdvance;
      rentalLines.push(line);
    } else {
      saleTotal += lineTotal;
      saleAdvance += lineAdvance;
      saleLines.push(line);

      saleUnits += quantity;

      longestPreparation = Math.max(
        longestPreparation,
        Math.max(0, Number(product.dias_preparacion || 0))
      );
    }
  }

  const productsTotal = saleTotal + rentalTotal;
  if (productsTotal < 10000) {
    return json({ error: "La compra mínima es de $10.000 en productos." }, 400);
  }
  const total = productsTotal + rentalDepositTotal + shippingFee + (expressRequested ? 10000 : 0);
  const advance = saleAdvance + rentalAdvance;

  if (total <= 0) {
    return json(
      { error: "El valor del pedido no es válido." },
      400
    );
  }

  const hasSale = saleLines.length > 0;
  const hasRental = rentalLines.length > 0;

  const today = dateKeyInBogota();

  const saleDeliveryDate = String(
    body.saleDeliveryDate || body.deliveryDate || ""
  );

  const rentalDeliveryDate = String(
    body.rentalDeliveryDate || body.deliveryDate || ""
  );

  let preparationDays = 0;
  let earliest = "";

  if (hasSale) {
    if (!isValidDateKey(saleDeliveryDate)) {
      return json(
        { error: "Selecciona una fecha válida para tu compra." },
        400
      );
    }

    preparationDays =
      saleUnits > 0
        ? Math.max(1,longestPreparation + Math.floor((saleUnits-1)/3) - (expressRequested ? 2 : 0))
        : 0;

    earliest = calculateEarliestDelivery(
      preparationDays,
      today
    );

    if (
      saleDeliveryDate < earliest ||
      isBlockedDate(saleDeliveryDate)
    ) {
      return json(
        {
          error:
            `La fecha elegida para tu compra no está disponible. La fecha más cercana es ${earliest}.`,
        },
        400
      );
    }
  }

  if (hasRental) {
    const tomorrow = addDays(today, 1);

    if (
      !isValidDateKey(rentalDeliveryDate) ||
      rentalDeliveryDate < tomorrow
    ) {
      return json(
        {
          error:
            `Para alquileres, solicita tu pedido con al menos un día de anticipación. Fecha mínima: ${tomorrow}.`,
        },
        400
      );
    }
  }

  let profile: any = null;

  const { data: byLegacyId, error: profileError } = await db
    .from("clientes_web")
    .select("*")
    .eq("cliente_id", String(legacy.id))
    .maybeSingle();

  if (profileError) {
    throw new Error(
      "No fue posible localizar tu perfil de cliente."
    );
  }

  profile = byLegacyId;

  if (!profile) {
    const { data: byPhone, error: phoneError } = await db
      .from("clientes_web")
      .select("*")
      .eq(
        "telefono",
        String(legacy.telefono || customer.telefono)
      )
      .maybeSingle();

    if (phoneError) {
      throw new Error(
        "No fue posible localizar tu perfil de cliente."
      );
    }

    profile = byPhone;
  }

  if (
    profile &&
    String(profile.cliente_id || "") !== String(legacy.id)
  ) {
    const { data: linked, error: linkError } = await db
      .from("clientes_web")
      .update({
        cliente_id: String(legacy.id),
      })
      .eq("id", profile.id)
      .select("*")
      .single();

    if (linkError) {
      throw new Error(
        "No fue posible vincular tu perfil con tu cuenta CUPISSA."
      );
    }

    profile = linked;
  }

  if (!profile) {
    const { data: created, error: createError } = await db
      .from("clientes_web")
      .insert([
        {
          cliente_id: String(legacy.id),
          nombres: String(customer.nombres),
          apellidos: String(customer.apellidos),
          telefono: String(customer.telefono),
          correo: String(customer.correo),
          direccion: String(customer.direccion),
          barrio: String(customer.barrio),
          ciudad: String(customer.ciudad),
        },
      ])
      .select("*")
      .single();

    if (createError) {
      throw new Error(
        "No fue posible vincular el pedido a tu perfil. Actualiza tus datos e inténtalo otra vez."
      );
    }

    profile = created;
  }

  const paymentMode = String(
    body.paymentMode || "full"
  );

  if (!["full", "deposit", "cod"].includes(paymentMode)) {
    return json(
      { error: "El tipo de pago no es válido." },
      400
    );
  }

  if(paymentMode==='cod' && (advance!==0 || (rentalLines.length===0 && saleLines.length===0) || referralDiscount ||
    !items.every((item:any)=>{
      const product=productMap.get(String(item.productId));
      const quantity=totalUnitsByProduct.get(String(item.productId))||0;
      return product?.pago_contraentrega===true && quantity<6 && quantity<Math.max(1,Number(product.cant_min_mayorista||6));
    }))) {
    return json({error:'Este pedido no cumple las condiciones para pago contra entrega.'},400);
  }
  const amountToPay = paymentMode==='cod' ? 0 : paymentMode === "full" ? total : advance;

  if (amountToPay <= 0 && paymentMode!=='cod') {
    return json(
      {
        error:
          "El anticipo calculado no es válido. Contacta a CUPISSA.",
      },
      400
    );
  }

  const clientTotal = Number(
    body.clientTotal ?? total
  );

  const clientAdvance = Number(
    body.clientAdvance ?? advance
  );

  if (
    Math.abs(clientTotal - total) > 1 ||
    Math.abs(clientAdvance - advance) > 1
  ) {
    return json(
      {
        error:
          "El resumen del pedido cambió. Regresa al resumen y vuelve a intentarlo.",
      },
      409
    );
  }

  const integritySecret = Deno.env.get(
    "WOMPI_INTEGRITY_SECRET"
  );

  const publicKey = Deno.env.get(
    "WOMPI_PUBLIC_KEY"
  );

  if (!integritySecret || !publicKey) {
    throw new Error(
      "Falta configurar WOMPI_PUBLIC_KEY o WOMPI_INTEGRITY_SECRET en Supabase Secrets."
    );
  }

  const amountInCents = Math.round(
    amountToPay * 100
  );

  const reference =
    `CUPWEB-${legacy.id}-${crypto.randomUUID()
      .replaceAll("-", "")
      .slice(0, 16)
      .toUpperCase()}`;

  if (referralDiscount) {
    const {data:reserved,error:rewardError}=await db.rpc("cupissa_referral_reserve",{
      p_usuario:rewardUserId,p_referencia:reference
    });
    if (rewardError || reserved !== true) return json({error:"El descuento ya fue utilizado o está reservado para otro pago. Actualiza tu carrito."},409);
  }

  const signature = await sha256Hex(
    `${reference}${amountInCents}COP${integritySecret}`
  );

  const shippingOrderType = hasSale ? "VENTA" : "ALQUILER";

  const makeOrderData = (
    type: "VENTA" | "ALQUILER",
    lines: any[],
    subtotal: number,
    orderAdvance: number,
    date: string
  ) => {
    const orderShipping =
      type === shippingOrderType ? shippingFee : 0;
    // `total` debe contener solo productos y depósitos de alquiler.
    // El domicilio queda exclusivamente en `envio`, para sumarlo una sola vez al restante.
    const orderTotal = subtotal + (type==='VENTA' && expressRequested ? 10000 : 0);

    return {
      cliente_id: String(profile.id),
      correo_cliente: String(customer.correo || '').trim().toLowerCase(),
      cliente_nombre:
        `${customer.nombres} ${customer.apellidos}`.trim(),
      telefono: String(customer.telefono),
      direccion: String(customer.direccion),
      barrio: String(customer.barrio),
      ciudad: String(customer.ciudad),
      fecha_entrega: date,
      tipo_pedido: type,
      total: orderTotal,
      envio: orderShipping,
      anticipo:
        paymentMode === "full"
          ? orderTotal + orderShipping
          : orderAdvance,
      productos: lines,
      estado: "AGENDADO",
      domicilio_estado: deliveryQuote.status,
      domicilio_nota: deliveryQuote.message,
      envio_nacional: deliveryQuote.national,
      domicilio_ciudad: deliveryQuote.city,
      domicilio_barrio: deliveryQuote.neighborhood,
    };
  };

  const ordersData: any[] = [];

  if (hasSale) {
    ordersData.push(
      makeOrderData(
        "VENTA",
        saleLines,
        saleTotal,
        saleAdvance,
        saleDeliveryDate
      )
    );
  }

  if (hasRental) {
    ordersData.push(
      makeOrderData(
        "ALQUILER",
        rentalLines,
        rentalTotal + rentalDepositTotal,
        rentalAdvance,
        rentalDeliveryDate
      )
    );
  }

  if (hasSale && !expressRequested) {
    const { data: reserved, error: reserveError } =
      await db.rpc("cupissa_reservar_cupo_pedido", {
        p_fecha: saleDeliveryDate,
        p_referencia: reference,
      });

    if (reserveError) {
      throw new Error(
        "No fue posible confirmar el cupo de esa fecha. Selecciona otra fecha o inténtalo nuevamente."
      );
    }

    if (reserved !== true) {
      return json(
        {
          error:
            "Esta fecha acaba de completar su máximo de pedidos. Selecciona otra fecha.",
        },
        409
      );
    }
  }

  if(paymentMode==='cod'){
    const insertedOrders:any[]=[];
    for(const order of ordersData){
      const {data,error}=await db.from('pedidos_web').insert([{
        cliente_id:order.cliente_id,correo_cliente:order.correo_cliente,cliente_nombre:order.cliente_nombre,
        telefono:order.telefono,direccion:order.direccion,barrio:order.barrio,ciudad:order.ciudad,
        fecha_entrega:order.fecha_entrega,tipo_pedido:order.tipo_pedido,total:order.total,
        envio:order.envio,anticipo:0,estado:'AGENDADO',
        productos:order.productos.map((line:any)=>({...line,_cupissa_pago_contraentrega:true,_cupissa_express:expressRequested}))
      }]).select('*').single();
      if(error)throw new Error('No se pudo registrar el pedido contra entrega: '+error.message);
      insertedOrders.push(data);
    }
    if(hasSale && !expressRequested)await db.rpc('cupissa_confirmar_cupo_pedido',{p_referencia:reference});
    return json({success:true,reference,orders:insertedOrders,order:insertedOrders[0]});
  }
  const { error: logError } = await db
    .from("pagos_web")
    .insert([
      {
        wompi_transaction_id: `PENDING_${reference}`,
        cliente_id: String(legacy.id),
        telefono: normalizePhone(customer.telefono),
        referencia: reference,
        monto: amountToPay,
        estado: "PROCESANDO",
        datos: {
          tipo: "PEDIDO_AGENDADO",
          orders_data: ordersData,
          amount_to_pay_cents: amountInCents,
          payment_mode: paymentMode,
          referral_discount: referralDiscount,
          referral_inviter_auth_user_id: referralDiscount ? rewardUserId : null,
          rental_days: hasRental ? rentalDays : 0,
          shipping: {
            city: deliveryQuote.city,
            neighborhood: deliveryQuote.neighborhood,
            fee: shippingFee,
            national: deliveryQuote.national,
            status: deliveryQuote.status,
            note: deliveryQuote.message,
          },
          created_at: new Date().toISOString(),
        },
      },
    ]);

  if (logError) {
    if (referralDiscount) await db.rpc("cupissa_referral_release",{p_referencia:reference});
    if (hasSale) {
      await db.rpc(
        "cupissa_liberar_cupo_pedido",
        { p_referencia: reference }
      );
    }

    throw new Error(
      "No fue posible preparar el pago. Inténtalo nuevamente."
    );
  }

  return json({
    reference,
    amountInCents,
    currency: "COP",
    publicKey,
    signature,
    summary: {
      total,
      productsTotal,
      refundableDeposits: rentalDepositTotal,
      shipping: shippingFee,
      shippingNational: deliveryQuote.national,
      shippingStatus: deliveryQuote.status,
      advance,
      amountToPay,
      preparedDays: preparationDays,
      earliestDelivery: earliest,
    },
  });
}

// -----------------------------------------------------
// REGISTRAR PEDIDO CUANDO WOMPI CONFIRMA EL PAGO
// -----------------------------------------------------

async function finalizeScheduledOrder(
  db: any,
  payment: any,
  transaction: any
) {
  const data =
    payment?.datos && typeof payment.datos === "object"
      ? payment.datos
      : {};

  const orderDataList = Array.isArray(data.orders_data)
    ? data.orders_data
    : data.order_data
      ? [data.order_data]
      : [];

  const reference = String(
    payment?.referencia || ""
  );

  const transactionId = String(
    transaction?.id || ""
  );

  const amount = Number(
    transaction?.amount_in_cents
  );

  if (
    data.tipo !== "PEDIDO_AGENDADO" ||
    !orderDataList.length
  ) {
    throw new Error(
      "No se encontró la información del pedido agendado."
    );
  }

  if (transaction.status !== "APPROVED") {
    return {
      status: String(transaction.status || "PENDING"),
      order: null,
      orders: [],
    };
  }

  if (
    !transactionId ||
    String(transaction.reference || "") !== reference ||
    transaction.currency !== "COP" ||
    amount !== Number(data.amount_to_pay_cents)
  ) {
    throw new Error(
      "El estado, monto o referencia del pago no coincide con el pedido."
    );
  }

  const getOrdersByIds = async (ids: string[]) => {
    if (!ids.length) return [];

    const { data: found, error } = await db
      .from("pedidos_web")
      .select("*")
      .in("id", ids);

    if (error) throw error;

    return found || [];
  };

  const savedIds = Array.isArray(data.order_ids)
    ? data.order_ids.map(String)
    : data.order_id
      ? [String(data.order_id)]
      : [];

  if (savedIds.length) {
    const existing = await getOrdersByIds(savedIds);

    if (existing.length === savedIds.length) {
      const { error: appliedError } = await db
        .from("pagos_web")
        .update({
          estado: "APLICADO",
          aplicado_en: payment.aplicado_en ||
            new Date().toISOString(),
          datos: {
            ...data,
            tipo: "PEDIDO_AGENDADO",
            transaction_id: transactionId,
            transaction_status: "APPROVED",
            order_ids: existing.map((order: any) => order.id),
            order_codes: existing.map((order: any) => order.codigo),
            order_id: existing[0]?.id || null,
            order_code: existing[0]?.codigo || null,
            processing_started_at: null,
          },
        })
        .eq("id", payment.id);

      if (appliedError) throw appliedError;

      if (data.referral_discount) await db.rpc('cupissa_referral_finalize',{p_referencia:reference});

      return {
        status: "APPROVED",
        order: existing[0],
        orders: existing,
      };
    }
  }

  const originalId = String(
    payment.wompi_transaction_id || ""
  );

  if (originalId.startsWith("PENDING_")) {
    const { data: claimed, error } = await db
      .from("pagos_web")
      .update({
        wompi_transaction_id: transactionId,
        datos: {
          ...data,
          transaction_id: transactionId,
          transaction_status: "APPROVED",
          processing_started_at: new Date().toISOString(),
        },
      })
      .eq("id", payment.id)
      .eq("wompi_transaction_id", originalId)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    if (!claimed) {
      const { data: fresh, error: freshError } =
        await db
          .from("pagos_web")
          .select("*")
          .eq("referencia", reference)
          .maybeSingle();

      if (freshError) throw freshError;

      if (fresh?.estado === "APLICADO") {
        const ids = Array.isArray(fresh.datos?.order_ids)
          ? fresh.datos.order_ids.map(String)
          : fresh.datos?.order_id
            ? [String(fresh.datos.order_id)]
            : [];

        const orders = await getOrdersByIds(ids);

        if (orders.length) {
          return {
            status: "APPROVED",
            order: orders[0],
            orders,
          };
        }
      }

      return {
        status: "PENDING",
        order: null,
        orders: [],
      };
    }

    payment = claimed;
  } else if (originalId !== transactionId) {
    throw new Error(
      "Esta referencia ya está asociada a otra transacción."
    );
  } else if (payment.estado === "APLICADO") {
    const orders = await getOrdersByIds(savedIds);

    if (orders.length) {
      return {
        status: "APPROVED",
        order: orders[0],
        orders,
      };
    }
  } else if (
    payment.estado === "PROCESANDO" &&
    data.transaction_id === transactionId &&
    data.processing_started_at
  ) {
    const age =
      Date.now() -
      new Date(data.processing_started_at).getTime();

    if (Number.isFinite(age) && age < 30000) {
      return {
        status: "PENDING",
        order: null,
        orders: [],
      };
    }

    const { error } = await db
      .from("pagos_web")
      .update({
        datos: {
          ...data,
          processing_started_at: new Date().toISOString(),
        },
      })
      .eq("id", payment.id);

    if (error) throw error;
  }

  const insertedOrders: any[] = [];

  for (const orderData of orderDataList) {
    const serviceType =
      (orderData.tipo_pedido || orderData.tipo_servicio) === "ALQUILER"
        ? "ALQUILER"
        : "VENTA";

    const marker = [
      {
        _cupissa_wompi_reference: reference,
        _cupissa_wompi_transaction_id: transactionId,
        _cupissa_order_group: serviceType,
      },
    ];

    const { data: recoveredRows, error: recoverError } =
      await db
        .from("pedidos_web")
        .select("*")
        .filter("productos", "cs", JSON.stringify(marker))
        .limit(1);

    if (recoverError) throw recoverError;

    const recovered = recoveredRows?.[0];

    if (recovered) {
      insertedOrders.push(recovered);
      continue;
    }

    const lines = Array.isArray(orderData.productos)
      ? orderData.productos
      : [];

    if (!lines.length) {
      throw new Error(
        "Uno de los pedidos no contiene productos."
      );
    }

    const markedLines = lines.map((line: any, index: number) => ({
      ...line,
      ...(index === 0
        ? {
            _cupissa_domicilio: {
              estado: orderData.domicilio_estado || "",
              nota: orderData.domicilio_nota || "",
              envio_nacional: Boolean(orderData.envio_nacional),
              ciudad: String(orderData.ciudad || ""),
              barrio: String(orderData.barrio || ""),
              valor: Number(orderData.envio || 0),
            },
          }
        : {}),
      _cupissa_wompi_reference: reference,
      _cupissa_wompi_transaction_id: transactionId,
      _cupissa_order_group: serviceType,
    }));

    const orderToInsert = {
      cliente_id: String(orderData.cliente_id),
      correo_cliente: String(orderData.correo_cliente || '').trim().toLowerCase(),
      tipo_pedido: serviceType,
      fecha_entrega: orderData.fecha_entrega,
      cliente_nombre: String(orderData.cliente_nombre || ""),
      telefono: String(orderData.telefono || ""),
      direccion: String(orderData.direccion || ""),
      barrio: String(orderData.barrio || ""),
      ciudad: String(orderData.ciudad || ""),
      total: Number(orderData.total || 0),
      envio: Number(orderData.envio || 0),
      anticipo: Number(orderData.anticipo || 0),
      productos: markedLines,
      estado: "AGENDADO",
    };

    const { data: inserted, error } = await db
      .from("pedidos_web")
      .insert([orderToInsert])
      .select("*")
      .single();

    if (error) {
      throw new Error(
        `El pago fue aprobado, pero no se pudo registrar uno de los pedidos: ${error.message}`
      );
    }

    insertedOrders.push(inserted);
  }

  const saleOrder = insertedOrders.find(
    (order: any) => order.tipo_pedido === "VENTA"
  );

  if (saleOrder) {
    const { error: capacityError } = await db.rpc(
      "cupissa_confirmar_cupo_pedido",
      { p_referencia: reference }
    );

    if (capacityError) {
      console.error(
        "No fue posible cerrar la reserva del cupo diario:",
        capacityError.message
      );
    }
  }

  const { error: appliedError } = await db
    .from("pagos_web")
    .update({
      estado: "APLICADO",
      aplicado_en: new Date().toISOString(),
      datos: {
        ...data,
        tipo: "PEDIDO_AGENDADO",
        transaction_id: transactionId,
        transaction_status: "APPROVED",
        order_ids: insertedOrders.map(
          (order: any) => order.id
        ),
        order_codes: insertedOrders.map(
          (order: any) => order.codigo
        ),
        order_id: insertedOrders[0]?.id || null,
        order_code: insertedOrders[0]?.codigo || null,
        processing_started_at: null,
      },
    })
    .eq("id", payment.id);

  if (appliedError) throw appliedError;

  if (data.referral_discount) {
    const {error:rewardError}=await db.rpc("cupissa_referral_finalize",{p_referencia:reference});
    if (rewardError) console.error("[CUPISSA] No se pudo marcar descuento consumido:",rewardError.message);
  }

  return {
    status: "APPROVED",
    order: insertedOrders[0] || null,
    orders: insertedOrders,
  };
}

// -----------------------------------------------------
// CONFIRMAR PAGO DESDE LA PÁGINA DE CHECKOUT
// -----------------------------------------------------

async function confirmWebPayment(db: any, body: any) {
  const legacy = await authenticateLegacyClient(
    db,
    String(body.clientId || ""),
    String(body.clientPassword || "")
  );

  const reference = String(body.reference || "");
  const transactionId = String(body.transactionId || "");

  if (
    !reference.startsWith(`CUPWEB-${legacy.id}-`) ||
    !transactionId
  ) {
    return json(
      {
        error:
          "Los datos de la transacción no corresponden a tu cuenta.",
      },
      400
    );
  }

  const { data: payment, error } = await db
    .from("pagos_web")
    .select("*")
    .eq("referencia", reference)
    .eq("cliente_id", String(legacy.id))
    .maybeSingle();

  if (error) throw error;

  if (
    !payment ||
    payment.datos?.tipo !== "PEDIDO_AGENDADO"
  ) {
    return json(
      {
        error:
          "No encontramos el pago pendiente de este pedido.",
      },
      404
    );
  }

  const transaction = await verifyWompiTransaction(
    transactionId
  );

  if (
    String(transaction.reference || "") !== reference
  ) {
    return json(
      {
        error:
          "La referencia de Wompi no coincide con el pedido.",
      },
      400
    );
  }

  if (
    Number(transaction.amount_in_cents) !==
      Number(payment.datos?.amount_to_pay_cents) ||
    transaction.currency !== "COP"
  ) {
    return json(
      {
        error:
          "El monto o la moneda de la transacción no coincide con el pedido.",
      },
      400
    );
  }

  if (transaction.status === "APPROVED") {
    const result = await finalizeScheduledOrder(
      db,
      payment,
      transaction
    );

    if (
      result.status !== "APPROVED" ||
      !result.order
    ) {
      return json(
        {
          status: "PENDING",
          message:
            "Estamos terminando de registrar el pedido.",
        },
        202
      );
    }

    if (payment.datos?.referral_discount) {
      await db.rpc('cupissa_referral_finalize',{p_referencia:reference});
    }

    return json({
      status: "APPROVED",
      order: result.order,
      orders:
        result.orders ||
        (result.order ? [result.order] : []),
    });
  }

  if (
    ["DECLINED", "ERROR", "VOIDED"].includes(
      String(transaction.status)
    )
  ) {
    const data =
      payment.datos && typeof payment.datos === "object"
        ? payment.datos
        : {};

    await db
      .from("pagos_web")
      .update({
        estado: "ERROR",
        datos: {
          ...data,
          transaction_status: String(transaction.status),
          transaction_id: transactionId,
        },
      })
      .eq("id", payment.id);

    await db.rpc(
      "cupissa_liberar_cupo_pedido",
      { p_referencia: reference }
    );

    return json({
      status: String(transaction.status),
      message:
        "El pago no fue aprobado. No se registró el pedido.",
    });
  }

  return json({
    status: "PENDING",
    message:
      "Wompi todavía está procesando la transacción.",
  });
}

// -----------------------------------------------------
// WEBHOOK Y RUTAS PRINCIPALES (DENO SERVE)
// -----------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      { error: "Método no permitido." },
      405
    );
  }

  try {
    const body = await req.json();
    const db = adminClient();

    if (body.action === "create_web_payment") {
      return await createWebPayment(db, body);
    }

    if (body.action === "confirm_web_payment") {
      return await confirmWebPayment(db, body);
    }

    if (body.event !== "transaction.updated") {
      return json({
        received: true,
        ignored: true,
      });
    }

    const validEvent = await verifyWompiEventSignature(
      body,
      req.headers.get("X-Event-Checksum")
    );

    if (!validEvent) {
      console.error(
        "Firma Wompi inválida. Revisa que WOMPI_EVENTS_SECRET sea el " +
        "secreto de eventos del MISMO ambiente (pruebas/producción) " +
        "que la transacción.",
        {
          hasSecret: !!Deno.env.get("WOMPI_EVENTS_SECRET"),
          hasHeader: !!req.headers.get("X-Event-Checksum"),
          properties: body?.signature?.properties,
          environment: body?.environment,
        }
      );

      return json(
        {
          error:
            "La firma del evento de Wompi no es válida.",
        },
        401
      );
    }

    console.log(
      "Evento Wompi verificado:",
      body.event
    );

    const incoming = body.data?.transaction;

    if (!incoming?.id || !incoming?.reference) {
      return json(
        { error: "Evento Wompi incompleto." },
        400
      );
    }

    const transaction = await verifyWompiTransaction(
      String(incoming.id)
    );

    if (
      String(transaction.reference || "") !==
      String(incoming.reference)
    ) {
      return json(
        {
          error:
            "La referencia del evento no coincide con Wompi.",
        },
        400
      );
    }

    const reference = String(
      transaction.reference
    );

    const transactionStatus = String(
      transaction.status || "PENDING"
    ).toUpperCase();

    // Los pagos del Portal de Pagos usan referencias CRED-.
    // Se procesan aquí sin tocar el flujo normal CUPWEB-.
    if (reference.startsWith("CRED-")) {
      const creditResult = await processCreditWompiTransaction(
        db,
        transaction
      );

      return json({
        received: true,
        credit_payment: true,
        ...creditResult,
      });
    }

    if (
      ["DECLINED", "ERROR", "VOIDED"].includes(
        transactionStatus
      )
    ) {
      if (reference.startsWith("CUPWEB-")) {
        const {
          data: failedOrderPayment,
          error: failedOrderLookupError,
        } = await db
          .from("pagos_web")
          .select("*")
          .eq("referencia", reference)
          .maybeSingle();

        if (failedOrderLookupError) {
          throw failedOrderLookupError;
        }

        if (
          failedOrderPayment?.datos?.tipo ===
            "PEDIDO_AGENDADO" &&
          failedOrderPayment.estado !== "APLICADO"
        ) {
          const failedData =
            failedOrderPayment.datos &&
            typeof failedOrderPayment.datos === "object"
              ? failedOrderPayment.datos
              : {};

          const {
            error: markOrderFailedError,
          } = await db
            .from("pagos_web")
            .update({
              estado: "ERROR",
              wompi_transaction_id: String(transaction.id),
              datos: {
                ...failedData,
                transaction_id: String(transaction.id),
                transaction_status: transactionStatus,
                processing_started_at: null,
              },
            })
            .eq("id", failedOrderPayment.id);

          if (markOrderFailedError) {
            throw markOrderFailedError;
          }

          const { error: releaseError } = await db.rpc(
            "cupissa_liberar_cupo_pedido",
            { p_referencia: reference }
          );

          if (releaseError) {
            console.error(
              "No se pudo liberar el cupo del pago rechazado:",
              releaseError.message
            );
          }
          if (failedData.referral_discount) {
            await db.rpc('cupissa_referral_release',{p_referencia:reference});
          }
        }
      }

      return json({
        received: true,
        status: transactionStatus,
        processed: true,
      });
    }

    if (transactionStatus !== "APPROVED") {
      return json({
        received: true,
        status: transactionStatus,
        ignored: true,
      });
    }

    if (reference.startsWith("CUPWEB-")) {
      const { data: payment, error } = await db
        .from("pagos_web")
        .select("*")
        .eq("referencia", reference)
        .maybeSingle();

      if (error) throw error;

      if (
        !payment ||
        payment.datos?.tipo !== "PEDIDO_AGENDADO"
      ) {
        return json({
          received: true,
          ignored: true,
        });
      }

      const result = await finalizeScheduledOrder(
        db,
        payment,
        transaction
      );

      return json({
        success: result.status === "APPROVED",
        order: result.order,
        orders:
          result.orders ||
          (result.order ? [result.order] : []),
      });
    }

    return json({
      received: true,
      ignored: true,
    });

  } catch (error) {
    console.error(
      "Excepción en swift-endpoint:",
      error
    );

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error procesando el evento Wompi.",
      },
      500
    );
  }
});
