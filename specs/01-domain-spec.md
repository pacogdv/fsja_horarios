# 01 — Especificación funcional del dominio

> **Estado:** Borrador · **Versión:** 0.2 · **Última actualización:** 2026-11-22

Este documento define **qué** debe hacer el sistema de generación y gestión de horarios escolares.
Es la fuente de verdad funcional: cualquier cambio de requisitos se refleja aquí antes de tocar código
(ver `CLAUDE.md`, sección 5).

---

## Índice

0. [Convenciones](#0-convenciones)
1. [Principios generales](#1-principios-generales)
2. [Glosario](#2-glosario)
3. [Módulo MH — Marcos horarios y configuración temporal](#3-módulo-mh--marcos-horarios-y-configuración-temporal)
4. [Módulo ENT — Entidades académicas y asistentes](#4-módulo-ent--entidades-académicas-y-asistentes)
5. [Módulo NL — Actividad no lectiva](#5-módulo-nl--actividad-no-lectiva)
6. [Módulo MOT — Motor de cálculo en 3 fases](#6-módulo-mot--motor-de-cálculo-en-3-fases)
7. [Módulo VIS / EDI / IO — Visualización, editor e importación/exportación](#7-módulo-vis--edi--io--visualización-editor-e-importaciónexportación)
8. [Módulo TFM — Requisitos de entrega](#8-módulo-tfm--requisitos-de-entrega)
9. [Matriz de permisos por caso de uso](#9-matriz-de-permisos-por-caso-de-uso)
10. [Preguntas abiertas](#10-preguntas-abiertas)

---

## 0. Convenciones

### 0.1 Identificadores
Cada requisito tiene un ID estable, que se cita en tests y código para mantener la trazabilidad.
Los IDs no se reutilizan: un requisito eliminado se marca como **Retirado**.

| Prefijo | Ámbito |
|---------|--------|
| `RG-NN` | Regla general (transversal) |
| `MH-NN` | Marcos horarios y configuración temporal |
| `ENT-NN` | Entidades académicas y asistentes |
| `NL-NN` | Actividad no lectiva |
| `PV-NN` | Motor, Fase A: pre-validación estática |
| `RD-NN` | Motor, Fase B: restricción dura |
| `RB-NN` | Motor, Fase B: restricción ponderable (blanda) |
| `MR-NN` | Motor, Fase C: multi-resultado |
| `VIS-NN` / `EDI-NN` / `IO-NN` | Visualización / Editor / Importación-exportación |
| `TFM-NN` | Requisitos de entrega del TFM |
| `INV-NN` | Invariante del dominio (debe cumplirse siempre al guardar datos) |
| `CU-NN` | Caso de uso |

Los criterios de aceptación se escriben como `<ID>-CA-NN` en formato *Dado / Cuando / Entonces*.

### 0.2 Palabras clave
**DEBE** = obligatorio. **PUEDE** = opcional para el usuario. **NO DEBE** = prohibido.

### 0.3 Unidades de tiempo
- Las horas reales se expresan en `HH:MM` (24 h, hora local del centro). Los intervalos son
  semiabiertos `[inicio, fin)`: un tramo que acaba a las 10:00 no se solapa con otro que empieza a las 10:00.
- Las duraciones lectivas se expresan en **tramos** (ver MH-03). Internamente se usa como unidad mínima
  el **cuarto de tramo** (`1/4`), de modo que todas las duraciones admitidas son múltiplos enteros de él.

---

## 1. Principios generales

### RG-01 — Sin restricciones artificiales por etapa
Todas las capacidades del sistema DEBEN estar disponibles para cualquier etapa educativa
(Infantil, Primaria, ESO y Bachillerato). La etapa es un **dato descriptivo** del grupo y NO DEBE
condicionar qué funcionalidades se pueden usar.

- **RG-01-CA-01**: Dado un grupo de Infantil, cuando se configuran optativas, desdobles, tramos
  fraccionados, sesiones de 1,5 tramos o el asistente de tutoría, entonces el sistema lo permite igual
  que en un grupo de Bachillerato.
- **RG-01-CA-02**: Ninguna regla de validación del dominio ni del motor toma el valor de `Etapa` como
  condición. Se comprueba con una prueba que ejecuta los mismos escenarios de aceptación con grupos de
  las cuatro etapas y obtiene el mismo resultado.

### RG-02 — Activación de características por ámbito
El equipo directivo (`ADMIN_DIRECCION`) decide qué características se activan, en estos ámbitos de
configuración, de más general a más específico:

`Centro → Marco horario → Curso (nivel) → Grupo`

- La configuración se hereda del ámbito superior, y el ámbito más específico prevalece.
- Características activables (catálogo inicial): tramos fraccionados, sesiones de duración no entera,
  asistente de tutoría, optativas, desdobles/subgrupos, intercambio de profesores equivalentes,
  aulas alternativas, guardias, reuniones y cada restricción ponderable (RB).
- **RG-02-CA-01**: Dado “desdobles” activo en el Centro y desactivado en el Grupo 1.º ESO B, cuando se
  intenta crear un subgrupo de 1.º ESO B, entonces el sistema lo rechaza indicando el ámbito que lo
  desactiva.
- **RG-02-CA-02**: Dado un ámbito sin valor propio, entonces el valor efectivo es el del ámbito
  superior más cercano que lo defina, y la interfaz muestra de dónde procede.

### RG-03 — Curso académico como contenedor
Todos los datos de configuración, actividades y horarios pertenecen a un **curso académico**. El sistema
PUEDE duplicar un curso académico completo para el siguiente (copia de estructura sin horarios
calculados).

### RG-04 — Lógica de negocio fuera de la interfaz
Toda regla de este documento se implementa en las capas de dominio y aplicación (o en el solver), nunca
en componentes de interfaz ni en controladores (ver `CLAUDE.md`, sección 2).

### RG-05 — Minimización de datos hacia el solver
El solver recibe solo identificadores opacos y datos numéricos. NO DEBE recibir nombres, correos ni
otros datos personales.

---

## 2. Glosario

| Término | Definición |
|---------|------------|
| **Centro** | Centro educativo. Raíz de la configuración. |
| **Curso académico** | Periodo anual (p. ej. 2026-2027) que agrupa todos los datos. |
| **Etapa** | Infantil, Primaria, ESO o Bachillerato. Solo es un dato descriptivo (RG-01). |
| **Curso (nivel)** | Nivel dentro de una etapa (p. ej. 3.º Primaria). |
| **Marco horario** | Calendario semanal de días y tramos con horas reales, compartido por uno o varios grupos. |
| **Tramo** | Intervalo de un día dentro de un marco, con hora de inicio y fin y un tipo (lectivo, recreo o parada de mediodía). |
| **Celda** | Combinación de día y tramo de un marco. |
| **Plantilla de disponibilidad** | Rejilla de celdas con un estado (`DISPONIBLE`, `PROHIBIDO`, `PREFERENTE` o `NO_PREFERENTE`) asociada a una entidad. |
| **Actividad lectiva** | Definición de algo que se imparte: materia, grupo(s), profesor(es), duración, número de sesiones semanales y criterio de aula. |
| **Sesión** | Cada ocurrencia semanal de una actividad que el motor debe colocar en el horario. |
| **Componente simultáneo** | Cada actividad que forma parte de un bloque que debe coincidir en el tiempo. |
| **Subgrupo** | Parte del alumnado de uno o varios grupos de referencia (desdoble, Diversificación, idioma…). |
| **Partición** | Conjunto de subgrupos disjuntos de un mismo grupo (p. ej. “Idioma: Francés / Alemán”). |
| **Posición prefijada** | Celda inicial fijada a mano para una sesión, que el motor debe respetar. |
| **Hueco** | Celda lectiva libre de un profesor situada entre dos celdas ocupadas del mismo día. |
| **Resultado** | Una solución completa generada por el motor (Fase C produce varios). |
| **Horario vigente** | El resultado (o versión editada de un resultado) que el centro publica. |

---

## 3. Módulo MH — Marcos horarios y configuración temporal

### 3.1 Modelo

**Marco horario**: `nombre`, `días lectivos` (subconjunto de lunes a domingo), `duración de la unidad
de tramo en minutos` (p. ej. 60), `lista ordenada de tramos por día`.

**Tramo**: `día`, `orden`, `inicio HH:MM`, `fin HH:MM`, `tipo` ∈ {`LECTIVO`, `RECREO`, `PARADA_MEDIODIA`},
`duración` ∈ {`1/2`, `3/4`, `1`} (solo en los tramos `LECTIVO`).

### 3.2 Requisitos

**MH-01 — Varios marcos coexistentes.** Un centro DEBE poder definir uno o varios marcos horarios
dentro de un mismo curso académico (p. ej. “Infantil/Primaria” y “ESO/Bachillerato”).
Cada grupo pertenece a exactamente un marco. Los profesores y las aulas pueden participar en varios marcos.

**MH-02 — Detección automática de solapamientos entre marcos.** El sistema DEBE calcular, a partir de
las horas reales, qué tramos de marcos distintos se solapan en el tiempo (mismo día de la semana e
intervalos `[inicio, fin)` con intersección no vacía). El resultado se guarda como **matriz de
solapamiento** y la usan el motor (RD-02, RD-04) y el editor (EDI-02).
- **MH-02-CA-01**: Dado el marco A con el tramo lunes 09:00-10:00 y el marco B con el tramo lunes 09:30-10:30,
  entonces ambos tramos figuran como solapados.
- **MH-02-CA-02**: Dado el marco A con el tramo lunes 09:00-10:00 y el marco B con el tramo lunes 10:00-11:00,
  entonces NO figuran como solapados.
- **MH-02-CA-03**: Al modificar las horas de un tramo, la matriz se recalcula, y los horarios calculados
  afectados se marcan como **desactualizados**.

**MH-03 — Tramos de duración entera o fraccionada.** Un tramo lectivo DEBE tener una duración de `1`,
`1/2` o `3/4` unidades de tramo.
- **INV-01**: `(fin − inicio)` en minutos = `duración × minutos por unidad` del marco. Si no se cumple,
  el tramo no se puede guardar.
- **INV-02**: Los tramos de un mismo día y marco NO DEBEN solaparse entre sí y se ordenan por hora de
  inicio.

**MH-04 — Sesiones de duración variable.** Una actividad lectiva DEBE poder tener una duración de
sesión de `1/2`, `3/4`, `1`, `1.5`, `2` o `3` tramos, en cualquier etapa (RG-01).
- Una sesión ocupa **tramos lectivos consecutivos del mismo día** cuya duración sumada es
  **exactamente** la duración de la sesión.
- Una sesión NO DEBE atravesar un tramo `RECREO` o `PARADA_MEDIODIA`.
- **MH-04-CA-01**: Dado un día con tramos lectivos 1, 1/2 y 1/2 seguidos, una sesión de 2 tramos puede
  ocupar los tres. Una sesión de 1,5 tramos puede ocupar `1 + 1/2`, pero no un único tramo de 1.
- **MH-04-CA-02**: Dado un recreo entre el tramo 3 y el tramo 4, una sesión de 2 tramos no puede
  empezar en el tramo 3.

**MH-05 — Días lectivos, recreos y paradas de mediodía.** Cada marco define sus días lectivos y, en cada
día, sus tramos de tipo `RECREO` y `PARADA_MEDIODIA`. Los días pueden tener estructuras distintas
(p. ej. viernes con jornada reducida). En los tramos no lectivos no se colocan sesiones lectivas, pero
sí PUEDEN colocarse guardias de recreo (NL-01) y reuniones (NL-02), si su ventana lo permite.

**MH-06 — Plantillas de disponibilidad semanal.** Las entidades **Centro, Grupo, Profesor, Aula y Materia**
DEBEN poder tener una plantilla de disponibilidad, con un estado por celda:

| Estado | Tipo | Efecto |
|--------|------|--------|
| `DISPONIBLE` | — | Valor por defecto. Sin efecto. |
| `PROHIBIDO` | Duro | Ninguna sesión o actividad de la entidad puede ocupar la celda (RD-05). |
| `PREFERENTE` | Blando | Se premia ocupar la celda (RB-03). |
| `NO_PREFERENTE` | Blando | Se penaliza ocupar la celda (RB-03). |

- La plantilla del Centro se aplica a todas las entidades.
- La plantilla de un Profesor o de un Aula se define en cada marco en el que participa.
- **Combinación**: una sesión puede colocarse en una celda solo si **ninguna** de las entidades
  implicadas (Centro, grupo(s), profesor(es), aula asignada y materia) la marca como `PROHIBIDO`.
  Los estados blandos de todas las entidades implicadas se suman en la función objetivo.
- **MH-06-CA-01**: Dado el profesor P con el lunes a 1.ª hora en `PROHIBIDO`, ninguna solución ni
  edición manual coloca a P en esa celda.
- **MH-06-CA-02**: Dada una celda `PROHIBIDO` del Centro, ninguna entidad puede ocuparla, aunque su
  propia plantilla diga `PREFERENTE`.

**MH-07 — Edición de la propia plantilla por el docente.** Un `DOCENTE` PUEDE marcar en su plantilla
las celdas `PREFERENTE` y `NO_PREFERENTE`. Marcar `PROHIBIDO` lo hace solo `ADMIN_DIRECCION`,
directamente o aprobando una solicitud del docente (ver P-03).

---

## 4. Módulo ENT — Entidades académicas y asistentes

### 4.1 Entidades

| Entidad | Atributos mínimos |
|---------|-------------------|
| **Departamento / Área** | nombre, abreviatura, jefe (profesor, opcional), clave externa |
| **Materia** | nombre, abreviatura, color, departamento, tipo de aula requerido (opcional), clave externa, plantilla |
| **Profesor** | nombre, abreviatura, departamento(s), máximo de horas lectivas semanales, máximo de horas complementarias semanales, máximo de tramos lectivos diarios (opcional), usuario vinculado (opcional), clave externa, plantilla |
| **Grupo** | nombre, etapa, curso (nivel), marco horario, nº de alumnos, aula de referencia (opcional), tutor (opcional), horas lectivas semanales objetivo, clave externa, plantilla |
| **Subgrupo** | nombre, grupo(s) de referencia, partición, nº de alumnos, clave externa |
| **Aula** | nombre, abreviatura, tipo (ordinaria, laboratorio, gimnasio, informática…), capacidad, clave externa, plantilla |
| **Actividad lectiva** | materia, grupo(s) y/o subgrupo(s), profesor(es), duración de sesión (MH-04), sesiones semanales, criterio de aula (ENT-02), modo de distribución (RB-04), posiciones prefijadas (opcional), profesores equivalentes (opcional, ENT-06), origen (`MANUAL`, `ASISTENTE_TUTORIA` o `IMPORTACION`) |

**Invariantes**
- **INV-03**: Abreviaturas y claves externas son únicas por tipo de entidad dentro del curso académico.
- **INV-04**: Todos los grupos y subgrupos de una actividad lectiva pertenecen al mismo marco horario.
- **INV-05**: Una actividad lectiva tiene al menos un profesor (o un conjunto de profesores equivalentes)
  y al menos un grupo o subgrupo.

### 4.2 Requisitos

**ENT-01 — Gestión de entidades.** `ADMIN_DIRECCION` DEBE poder crear, consultar, modificar y eliminar
departamentos, materias, profesores, grupos, subgrupos, aulas y actividades lectivas.
Si una entidad tiene dependencias (p. ej. un profesor con actividades), al eliminarla el sistema
DEBE mostrar las dependencias afectadas y pedir confirmación, o impedir el borrado.

**ENT-02 — Conjuntos de aulas alternativas.** Cada actividad lectiva DEBE indicar uno de estos criterios de aula:

| Criterio | Comportamiento |
|----------|----------------|
| `SIN_AULA` | La sesión no ocupa aula (p. ej. actividad exterior). |
| `FIJA` | Siempre la misma aula. |
| `PREFERENTE_CON_ALTERNATIVAS` | Un aula preferente y una lista ordenada de alternativas. Usar una alternativa penaliza la solución (RB-06). |
| `POOL` | Cualquier aula de un conjunto dado, sin preferencia. |

- Si la actividad no especifica nada, se usa el aula de referencia del grupo (como `FIJA`).
- Si la capacidad del aula es menor que el número de alumnos de la sesión, se genera una advertencia
  en la Fase A (PV-09). No es un error.
- **ENT-02-CA-01**: Dada una actividad con `POOL = {Lab1, Lab2}`, cuando Lab1 está ocupado en una celda,
  el motor puede asignar Lab2 en esa celda.

**ENT-03 — Asistente de tutoría y carga automática.** Disponible en cualquier etapa (RG-01).
Al asignar un tutor a un grupo, el sistema DEBE ofrecer autocompletar las horas restantes del grupo con
sesiones del tutor:
1. Calcula `horas restantes = horas lectivas semanales objetivo del grupo − suma de (duración ×
   sesiones semanales) de las actividades existentes del grupo`.
2. Propone repartir esas horas entre materias que elige el usuario (por defecto, las de su
   departamento), con la duración de sesión indicada por el usuario.
3. Muestra la propuesta antes de crear nada. El usuario puede ajustarla o descartarla.
4. Las actividades creadas se marcan con `origen = ASISTENTE_TUTORIA` y se pueden deshacer en bloque.
5. Las actividades de especialistas u otras materias ya configuradas no se modifican.
- **ENT-03-CA-01**: Dado un grupo con objetivo de 25 h y 8 h ya asignadas a especialistas, cuando se
  asigna el tutor y se acepta el asistente, entonces se crean actividades del tutor que suman 17 h, y la
  suma total del grupo es 25 h.
- **ENT-03-CA-02**: Si las horas propuestas superan el máximo de horas lectivas del tutor, el asistente
  muestra una advertencia con el exceso y no crea nada sin confirmación explícita.
- **ENT-03-CA-03**: Si las horas restantes son ≤ 0, el asistente lo informa y no propone sesiones.

**ENT-04 — Optativas y simultaneidad.** Disponible en cualquier etapa (RG-01).
- **ENT-04a — Bloque simultáneo explícito**: conjunto de actividades lectivas (varios profesores,
  materias, aulas, grupos o subgrupos) que DEBEN impartirse a la vez (RD-08).
  - **INV-06**: Todas las actividades de un bloque tienen la misma duración de sesión y el mismo número
    de sesiones semanales, y pertenecen al mismo marco.
- **ENT-04b — Conjunto de optativas**: grupos participantes y lista de optativas (materia, profesor,
  aula y, opcionalmente, nº de alumnos). Reglas:
  - Todas las optativas de un mismo conjunto se imparten simultáneamente (se modela como bloque simultáneo).
  - Mientras se imparte el conjunto, los grupos participantes no tienen ninguna otra sesión.
  - **Control de solapamiento entre conjuntos**: dos conjuntos pueden marcarse como
    **incompatibles** (comparten alumnado) y entonces NO DEBEN coincidir en ninguna celda (RD-08).
- **ENT-04-CA-01**: Dado el conjunto “Optativas 4.º ESO” con Francés, TIC y Música para 4.º A y 4.º B,
  entonces en la solución las tres se colocan en las mismas celdas y ninguno de los dos grupos tiene
  otra sesión en ellas.

**ENT-05 — Desdobles y subgrupos.** Disponible en cualquier etapa (RG-01).
- Un **subgrupo** pertenece a una **partición** y tiene uno o varios **grupos de referencia**
  (p. ej. Diversificación formada con alumnos de 3.º A y 3.º B).
- Los subgrupos de una misma partición son **disjuntos**: pueden tener sesiones simultáneas.
- Dos subgrupos de particiones distintas que **comparten algún grupo de referencia** comparten
  alumnado: NO pueden tener sesiones simultáneas. Si no comparten ningún grupo de referencia, sí pueden.
- Una sesión del grupo de referencia ocupa a todos sus subgrupos (sesión común).
- Una sesión de un subgrupo ocupa ese subgrupo y bloquea las sesiones comunes del grupo de referencia
  en esa celda.
- **ENT-05-CA-01**: Dados los subgrupos “Lab-A1” y “Lab-A2” de la partición “Laboratorio” de 1.º A, pueden
  coincidir en la misma celda con profesores y aulas distintos.
- **ENT-05-CA-02**: Dados “Lab-A1” (partición Laboratorio) y “Francés-A” (partición Idioma) de 1.º A, no
  pueden coincidir en la misma celda.
- **ENT-05-CA-03**: Dado el subgrupo “Diversificación 3.º” con referencias 3.º A y 3.º B, mientras tiene
  sesión, ni 3.º A ni 3.º B pueden tener sesión común.

**ENT-06 — Intercambio entre profesores equivalentes.** Una actividad PUEDE definir un conjunto de
profesores equivalentes en lugar de uno fijo. El motor elige uno de ellos.
- Por defecto, todas las sesiones de la actividad las imparte el **mismo** profesor elegido. El usuario
  PUEDE desactivarlo para permitir un profesor distinto en cada sesión.
- La elección respeta las cargas máximas de cada profesor (RD-12).
- **ENT-06-CA-01**: Dada una actividad con equivalentes {P1, P2} y P1 sin disponibilidad suficiente,
  entonces la solución asigna P2.

---

## 5. Módulo NL — Actividad no lectiva

Toda actividad no lectiva ocupa al profesor: cuenta para el no solapamiento (RD-02) y para la
carga (RD-12).

**NL-01 — Servicios de guardia.** Atributos: `tipo` (`AULA`, `RECREO`, `BIBLIOTECA`, `OTRO`, ampliable),
`ventana` (celdas, incluidas las de recreo, en las que se presta), `docentes adscritos`,
`cupo semanal por docente` (número de tramos de guardia que hace cada adscrito, configurable de forma
individual), `máximo de docentes simultáneos por tramo` y `mínimo de docentes por tramo` (opcional,
0 por defecto).
- Cada docente adscrito hace **exactamente** su cupo semanal (RD-09).
- En ningún tramo de la ventana se supera el máximo de docentes simultáneos, ni se baja del mínimo (RD-09).
- **NL-01-CA-01**: Dada una guardia de recreo con 6 adscritos, un cupo de 1 cada uno, máximo 2 por tramo
  y 5 recreos semanales, entonces la solución reparte 6 guardias sin superar 2 por recreo.

**NL-02 — Reuniones de profesores.** Atributos: `tipo` (`DEPARTAMENTO`, `CICLO`, `EQUIPO_DOCENTE`, `OTRA`),
`participantes` (una lista explícita o calculados: miembros de un departamento o profesores de un grupo),
`frecuencia semanal` (nº de reuniones por semana), `duración` (simple = 1 tramo, doble = 2 tramos
consecutivos) y `ventana horaria` (celdas permitidas).
- Todos los participantes coinciden en las mismas celdas (RD-10).
- **NL-02-CA-01**: Dada una reunión de departamento semanal doble, con ventana martes y jueves por la tarde,
  entonces la solución la coloca en dos tramos consecutivos de esa ventana, con todos los miembros libres.

**NL-03 — Sesiones complementarias y reducciones.** Se asignan a un docente concreto. Atributos: `tipo`
(reducción por cargo, coordinación, mayor de 55, complementaria…), `horas semanales`,
`cómputo` (`LECTIVO` o `COMPLEMENTARIO`), `posición` (prefijada o libre dentro de una ventana).
- Las reducciones con cómputo `LECTIVO` reducen el máximo de horas lectivas disponibles del docente.

---

## 6. Módulo MOT — Motor de cálculo en 3 fases

### 6.0 Visión general

```
[Datos del curso] → Fase A: Pre-validación → ¿errores? ─sí→ informe, no se lanza el solver
                                              └no→ Fase B: CP-SAT → Fase C: N resultados → comparación → horario vigente
```

- **CU-01 — Lanzar cálculo** (`ADMIN_DIRECCION`): se ejecuta de forma **asíncrona**, con estado
  consultable (`EN_COLA`, `VALIDANDO`, `CALCULANDO`, `COMPLETADO`, `SIN_SOLUCION`, `CANCELADO`, `ERROR`),
  y se puede cancelar.
- Parámetros de ejecución: tiempo límite (segundos), número de resultados N (MR-01), pesos de las
  restricciones ponderables (RB), semilla y modo determinista. La reproducibilidad exacta (misma
  entrada + misma semilla ⇒ mismo resultado) solo se garantiza en modo determinista, que es más lento.
- La ejecución usa una **instantánea** de los datos: los cambios posteriores no la alteran.
- Se aplica rate limiting a esta operación (ver `CLAUDE.md`, sección 3).

### 6.1 Fase A — Pre-validación estática

Detecta, sin lanzar el solver, condiciones que hacen el problema imposible. Cada hallazgo incluye la
**severidad** (`ERROR` bloquea el lanzamiento; `ADVERTENCIA` no lo bloquea), las **entidades
implicadas**, las **cifras** (necesario frente a disponible) y una **sugerencia**.

| ID | Comprobación | Severidad |
|----|--------------|-----------|
| **PV-01** | **Exceso de horas del grupo**: la duración total de las sesiones que ocupan al grupo (las comunes, más la mayor carga de cada partición de subgrupos) supera las celdas lectivas no `PROHIBIDO` del grupo. | ERROR |
| **PV-02** | **Exceso de horas del profesor**: sesiones + guardias + reuniones + complementarias superan sus celdas no `PROHIBIDO`. | ERROR |
| **PV-03** | **Exceso de horas del aula**: las sesiones con aula `FIJA` superan las celdas disponibles del aula. Para cada `POOL`: las sesiones cuyo conjunto de aulas está contenido en el pool superan la suma de celdas disponibles del pool. | ERROR |
| **PV-04** | **Posiciones prefijadas en conflicto**: una prefijada en una celda `PROHIBIDO`, en un tramo no lectivo, que atraviesa un recreo, cuya duración no encaja con los tramos, o dos prefijadas que solapan el mismo profesor, grupo o aula (incluso entre marcos, MH-02). | ERROR |
| **PV-05** | **Cupos de guardia inviables**: la suma de cupos supera `máximo simultáneos × celdas de la ventana`; o es menor que `mínimo × celdas`; o el cupo de un docente supera sus celdas libres dentro de la ventana. | ERROR |
| **PV-06** | **Duración no realizable**: no existe en ningún día del marco una secuencia de tramos consecutivos cuya suma sea igual a la duración de la sesión (MH-04). | ERROR |
| **PV-07** | **Distribución imposible**: el nº de sesiones semanales de una actividad con `DIAS_DISTINTOS` obligatorio supera el nº de días lectivos. | ERROR |
| **PV-08** | **Bloque simultáneo incoherente**: se incumple INV-06, o dos componentes del bloque comparten profesor o aula. | ERROR |
| **PV-09** | **Capacidad de aula** inferior al nº de alumnos. | ADVERTENCIA |
| **PV-10** | **Carga docente**: las horas asignadas superan el máximo lectivo o complementario del profesor. | ERROR |
| **PV-11** | **Grupo incompleto**: las horas asignadas del grupo no coinciden con sus horas lectivas semanales objetivo. | ADVERTENCIA |
| **PV-12** | **Referencias rotas**: una actividad sin profesor o sin grupo, un grupo sin marco, un aula inexistente en un pool. | ERROR |

- **PV-CA-01**: Dado un grupo con 30 celdas disponibles y 32 h de actividades, cuando se lanza el
  cálculo, entonces no se invoca al solver y el informe muestra PV-01 con “necesario 32 / disponible 30”.
- **PV-CA-02**: Dado un conjunto de datos sin errores, la Fase A termina con cero hallazgos `ERROR` y
  se pasa a la Fase B.

### 6.2 Fase B — Optimización CP-SAT

#### 6.2.1 Restricciones duras (peso infinito)
Una solución que incumpla cualquiera de ellas **no es válida**.

| ID | Restricción |
|----|-------------|
| **RD-01** | Cada sesión de cada actividad lectiva se coloca **exactamente una vez**, en tramos consecutivos válidos (MH-04). |
| **RD-02** | **No solapamiento de profesor**: un profesor no tiene dos ocupaciones (sesión, guardia, reunión o complementaria) en celdas que coinciden en el tiempo, **incluidas celdas de marcos distintos** según la matriz MH-02. |
| **RD-03** | **No solapamiento de grupo**: un grupo o subgrupo no tiene dos sesiones a la vez, según las reglas de ENT-05. |
| **RD-04** | **No solapamiento de aula**: un aula no aloja dos sesiones a la vez, incluso entre marcos (MH-02). |
| **RD-05** | **Celdas `PROHIBIDO`** de todas las entidades implicadas (MH-06). |
| **RD-06** | **Tramos no lectivos**: ninguna sesión lectiva ocupa ni atraviesa `RECREO` o `PARADA_MEDIODIA`. |
| **RD-07** | **Posiciones prefijadas** y sesiones bloqueadas (EDI-04) se respetan. |
| **RD-08** | **Simultaneidad**: los componentes de un bloque coinciden en las mismas celdas; los conjuntos de optativas incompatibles no coinciden (ENT-04). |
| **RD-09** | **Guardias**: el cupo de cada docente es exacto y se respetan el máximo y el mínimo de docentes simultáneos por tramo (NL-01). |
| **RD-10** | **Reuniones**: todos los participantes coinciden, se respetan la frecuencia, la duración y la ventana, con como máximo una ocurrencia de cada reunión por día (NL-02). |
| **RD-11** | **Aula válida**: el aula asignada pertenece al criterio de aula de la actividad (ENT-02). |
| **RD-12** | **Cargas máximas**: no se superan las horas lectivas semanales, las horas complementarias ni los tramos lectivos diarios máximos del profesor (si están definidos). |
| **RD-13** | **Distribución obligatoria**: si una actividad marca su modo de distribución (RB-04) como obligatorio, se aplica como restricción dura. |
| **RD-14** | **Profesores equivalentes**: se asigna exactamente un profesor del conjunto, el mismo en todas las sesiones salvo que se haya desactivado (ENT-06). |

#### 6.2.2 Restricciones ponderables
- Cada una tiene un **peso entero de 0 a 100**, configurable por `ADMIN_DIRECCION`. Con peso `0`, la
  restricción queda desactivada.
- Función objetivo (a minimizar): `Σ peso_i × penalización_i`, donde cada penalización se mide en
  unidades naturales (minutos, cuartos de tramo, sesiones, días…). Su definición exacta forma parte del contrato
  con el solver.
- Los pesos por defecto se proponen en la tabla y son editables.

| ID | Objetivo | Penalización | Peso por defecto |
|----|----------|--------------|------------------|
| **RB-01** | Minimizar **huecos** en los horarios de los profesores | Minutos reales lectivos libres entre la primera y la última ocupación de cada profesor y día (sin contar recreos ni paradas). Se mide en minutos porque un profesor puede trabajar en marcos con unidades de tramo distintas. | 80 |
| **RB-02** | Agrupar las **horas libres de los grupos** en los extremos de la jornada | Nº de cuartos de tramo libres de cada grupo situados entre dos sesiones del mismo día. | 70 |
| **RB-03** | Respetar las **preferencias de plantilla** | +1 por cada cuarto de tramo ocupado en una celda `NO_PREFERENTE` de una entidad implicada; +1 por cada celda `PREFERENTE` de profesor que queda sin usar. | 50 |
| **RB-04** | **Distribución** de las sesiones de una materia, según el modo de la actividad: `DIAS_DISTINTOS` (no repetir día), `DIAS_NO_CONSECUTIVOS` (además, evitar días seguidos) o `DIAS_CONSECUTIVOS` (concentrar en días seguidos) | `DIAS_DISTINTOS`: sesiones en exceso por día (sesiones del día − 1). `DIAS_NO_CONSECUTIVOS`: lo anterior + nº de pares de días consecutivos con sesión. `DIAS_CONSECUTIVOS`: nº de rachas de días con sesión − 1. | 60 |
| **RB-05** | Minimizar los **días de asistencia** del docente | Nº de días con alguna ocupación, por docente. | 20 |
| **RB-06** | Usar el **aula preferente** (ENT-02) | Nº de sesiones colocadas en un aula alternativa, ponderado por la posición en la lista. | 30 |

- **RB-CA-01**: Dados dos escenarios idénticos con RB-01 con peso 0 y con peso 100, el total de huecos
  de la solución con peso 100 es menor o igual que con peso 0.
- **RB-CA-02**: Toda solución entregada cumple el 100 % de las restricciones RD-01 a RD-14. Se verifica
  con un comprobador independiente del solver.

#### 6.2.3 Sin solución
Si CP-SAT demuestra que no hay solución (`INFEASIBLE`), el sistema DEBE devolver un **diagnóstico**:
un subconjunto reducido de restricciones en conflicto (p. ej. obtenido con asunciones del solver),
expresado con las entidades implicadas. Si se agota el tiempo sin solución (`UNKNOWN`), lo indica y
sugiere ampliar el tiempo o relajar restricciones.

### 6.3 Fase C — Multi-resultado

**MR-01** — El motor DEBE generar **N soluciones completas** alternativas (N configurable de 1 a 10;
3 por defecto), con los nombres `Resultado 1`, `Resultado 2`, … ordenados por puntuación.

**MR-02 — Diversidad**: cada resultado difiere de los anteriores en al menos un **X %** de las
posiciones de sesión (X configurable; 10 % por defecto). Si no se consiguen N resultados distintos en
el tiempo límite, se entregan los obtenidos y se informa.

**MR-03 — Métricas comparativas** de cada resultado:

| Métrica | Definición |
|---------|------------|
| Total de huecos de profesores | Suma de la penalización de RB-01, expresada en horas y minutos. |
| Huecos de grupos | Suma de la penalización de RB-02, expresada en tramos. |
| % de preferencias cumplidas | `celdas marcadas cumplidas / total de celdas marcadas` (una celda `PREFERENTE` se cumple si se ocupa; una `NO_PREFERENTE`, si no se ocupa). |
| Distribución cumplida | % de actividades sin incumplimientos de RB-04. |
| Puntuación global | Valor de la función objetivo (menor es mejor) y su normalización `100 · (1 − Σ Wᵢ·Penᵢ/Mᵢ / Σ Wᵢ)`, donde `Mᵢ` es una cota superior analítica de cada penalización (ver `02-architecture-plan.md`, 4.6). Vale 100 sin penalizaciones o si todos los pesos son 0. |
| Estado y tiempo | `OPTIMO` / `FACTIBLE` y segundos de cálculo. |

**MR-04** — La interfaz DEBE mostrar los resultados lado a lado (tabla comparativa) y permitir abrir
cada uno en la rejilla. `ADMIN_DIRECCION` elige uno como **horario vigente**. Los demás se conservan
hasta que se borran.

- **MR-CA-01**: Dado N = 3 y un problema con margen, entonces se obtienen 3 resultados válidos, distintos
  entre sí en al menos un 10 % de las posiciones, cada uno con todas sus métricas.

---

## 7. Módulo VIS / EDI / IO — Visualización, editor e importación/exportación

### 7.1 Visualización

**VIS-01 — Rejilla horaria.** Rejilla de días × tramos limpia, moderna y responsive. Cada sesión muestra
la materia (con su color), el/los profesor(es), el aula y el grupo/subgrupo. Los recreos y las paradas se
distinguen visualmente. Las sesiones de duración fraccionada o múltiple ocupan su altura proporcional.

**VIS-02 — Cambio instantáneo de perspectiva.** Selector **Grupo / Profesor / Aula** más selector de
entidad. Al cambiar de perspectiva no se recarga la página ni se vuelve a pedir el horario al servidor.
- **VIS-02-CA-01**: Con el horario ya cargado, al cambiar de perspectiva la rejilla se actualiza
  en menos de 200 ms (medido en E2E con el conjunto de datos semilla).

**VIS-03 — Varios marcos.** La vista de un grupo usa su marco. La vista de un profesor o aula que
participa en varios marcos muestra una **línea temporal unificada en horas reales**, con las
ocupaciones de cada marco.

**VIS-04 — Responsive.** En pantallas estrechas (< 768 px) se muestra por defecto la vista de **un día**
con navegación entre días. No hay scroll horizontal de página.

**VIS-05 — Vista del docente.** Un `DOCENTE` ve por defecto **su** horario vigente y no puede ver el de
otros docentes (salvo que se decida otra cosa en P-04).

### 7.2 Editor interactivo post-cálculo

**EDI-01 — Arrastrar y soltar.** `ADMIN_DIRECCION` PUEDE mover sesiones de un resultado o del horario
vigente arrastrándolas a otra celda, y PUEDE intercambiar dos sesiones.

**EDI-02 — Bloqueo por restricciones duras.** Mientras se arrastra, las celdas de destino se marcan como
válidas o no válidas. Soltar en una celda no válida **no aplica** el cambio.

**EDI-03 — Diagnóstico claro.** En una celda no válida se muestra **por qué**, con nombres concretos. Ejemplos:
- “El profesor *Ana Ruiz* ya imparte *Matemáticas* a *2.º ESO B* en esta franja.”
- “El aula *Laboratorio 1* está ocupada por *Física y Química – 1.º Bach A*.”
- “La celda es *PROHIBIDO* en la plantilla del grupo *3.º Primaria A*.”
- “La sesión dura 2 tramos y atravesaría el *recreo*.”
- “El tramo se solapa con el marco *Infantil/Primaria*, donde *Luis Gómez* tiene guardia.”

Además, PUEDE mostrar el impacto en las restricciones ponderables (variación de la puntuación).
- **EDI-CA-01**: Dado un intento de mover una sesión del profesor P a una celda donde P ya tiene clase,
  entonces el movimiento se rechaza y el mensaje nombra a P, la sesión que lo impide y el grupo.

**EDI-04 — Bloqueo de sesiones.** Una sesión colocada se PUEDE **bloquear** (fijar). Al recalcular,
las bloqueadas son posiciones prefijadas (RD-07).

**EDI-05 — Deshacer / rehacer y versiones.** Las ediciones se pueden deshacer y rehacer en la sesión de
trabajo. Al guardar se crea una **nueva versión** del horario. Las versiones anteriores se conservan,
con fecha y autor.

**EDI-06 — Validación en servidor.** Toda edición se revalida en el servidor con las mismas reglas
RD antes de guardarse. La validación del cliente es solo una ayuda visual.

### 7.3 Importación y exportación

**IO-01 — Claves externas.** Todas las entidades de ENT-01 tienen un campo `clave externa` opcional y
único por tipo (INV-03), para integrarse con plataformas educativas. Las importaciones las usan para
emparejar registros (crear o actualizar).

**IO-02 — Importación.** Formatos CSV y JSON (con su esquema documentado). La importación es **atómica**:
si una fila es inválida, no se importa nada y se devuelve un informe con la fila, el campo y el motivo.
Antes de confirmar se muestra un **modo de simulación** (qué se crearía, actualizaría u omitiría).

**IO-03 — Exportación PDF imprimible.** Por grupo, profesor o aula, individual o en lote (todos los
grupos, todos los profesores…), en formato A4 apaisado legible en blanco y negro.

**IO-04 — Exportación Excel / CSV.** Una fila por sesión colocada (día, tramo, hora de inicio y fin,
materia, grupo/subgrupo, profesor, aula, con sus claves externas). El Excel tiene una hoja por
perspectiva.

**IO-05 — Exportación JSON estructurada.** Con un esquema versionado (`schemaVersion`), que incluye la
configuración y el horario.
- **IO-05-CA-01**: Exportar a JSON un curso académico e importarlo en un centro vacío produce datos
  equivalentes (mismas entidades, actividades y posiciones).

---

## 8. Módulo TFM — Requisitos de entrega

**TFM-01 — Datos semilla.** Un comando de seed DEBE cargar:
- **Usuarios de prueba**, uno por rol: `ADMIN_DIRECCION`, `DOCENTE` (vinculado a un profesor con
  horario) e `INVITADO_DEMO`. Sus credenciales se documentan en el `README`.
- **Un centro educativo ficticio completo y realista** con:
  - Las cuatro etapas: Infantil (3 grupos: 3, 4 y 5 años), Primaria (6 grupos), ESO (8 grupos, 2 por
    curso) y Bachillerato (4 grupos, 2 por curso: Ciencias y Humanidades/CC. Sociales).
  - **Dos marcos horarios** con tramos que se solapan (Infantil/Primaria y ESO/Bachillerato), y al menos
    un profesor y un aula compartidos entre ambos.
  - Al menos un caso de cada característica, en etapas variadas (RG-01): tramos fraccionados, sesiones
    de 1,5 y 2 tramos, asistente de tutoría, optativas, desdobles, Diversificación, aulas alternativas
    y pools, profesores equivalentes, guardias (aula y recreo), reuniones, reducciones y plantillas con
    los cuatro estados.
- **TFM-01-CA-01**: Tras `docker compose up` y el seed, se puede iniciar sesión con las credenciales
  documentadas y ver un horario ya calculado, sin más pasos.
- **TFM-01-CA-02**: El conjunto semilla pasa la Fase A sin errores, y la Fase B encuentra solución en
  menos de 120 s en el entorno de referencia (definido en `/docs`).

**TFM-02 — Seguridad del seed.** El seed NO DEBE ejecutarse en un entorno marcado como producción. Las
credenciales de prueba se definen mediante variables de entorno, con valores de ejemplo en
`.env.example`, y nunca dan acceso a datos reales.

**TFM-03 — Modo demo.** `INVITADO_DEMO` puede navegar por todo el centro de demostración en modo
lectura. Las operaciones de escritura y el lanzamiento del motor responden con un mensaje explicativo,
sin modificar datos.

---

## 9. Matriz de permisos por caso de uso

| Caso de uso | ADMIN_DIRECCION | DOCENTE | INVITADO_DEMO |
|-------------|:---:|:---:|:---:|
| Configurar marcos, tramos y ámbitos (MH, RG-02) | ✅ | ❌ | 👁️ lectura |
| Gestionar entidades y actividades (ENT) | ✅ | ❌ | 👁️ lectura |
| Editar la plantilla de cualquier entidad (MH-06) | ✅ | ❌ | ❌ |
| Editar preferencias de la propia plantilla (MH-07) | ✅ | ✅ (solo `PREFERENTE`/`NO_PREFERENTE`) | ❌ |
| Gestionar guardias, reuniones y reducciones (NL) | ✅ | ❌ | 👁️ lectura |
| Lanzar, cancelar y consultar cálculos (MOT) | ✅ | ❌ | 👁️ consulta de resultados existentes |
| Elegir el horario vigente (MR-04) | ✅ | ❌ | ❌ |
| Editor manual (EDI) | ✅ | ❌ | ❌ |
| Ver horarios (VIS) | ✅ todos | ✅ el suyo (P-04) | 👁️ todos (demo) |
| Importar (IO-02) | ✅ | ❌ | ❌ |
| Exportar (IO-03 a IO-05) | ✅ | ✅ el suyo | ✅ demo |

La autorización se aplica en el servidor, con denegación por defecto (`CLAUDE.md`, sección 3.2).

---

## 10. Preguntas abiertas

Decisiones pendientes de validar. Mientras no se resuelvan, se aplica el valor marcado como
**supuesto actual**.

| ID | Pregunta | Supuesto actual |
|----|----------|-----------------|
| P-01 | ¿Un único centro por instalación o varios centros (multi-tenant)? | Un único centro por instalación. |
| P-02 | En RB-04, ¿“días consecutivos” significa *concentrar* las sesiones en días seguidos o *evitar* días seguidos? | Se ofrecen ambos modos (`DIAS_CONSECUTIVOS` y `DIAS_NO_CONSECUTIVOS`). |
| P-03 | ¿Puede un docente solicitar celdas `PROHIBIDO` (con aprobación de la dirección)? | Sí, mediante una solicitud que aprueba `ADMIN_DIRECCION`. |
| P-04 | ¿Puede un docente ver los horarios de grupos y de otros docentes? | Solo el suyo y los de los grupos a los que da clase. |
| P-05 | Las celdas `PROHIBIDO` de un profesor en un marco, ¿se propagan automáticamente a los tramos solapados de otros marcos? | No se propagan. El no solapamiento real ya lo garantiza RD-02. |
| P-06 | ¿Las guardias de recreo computan como horas complementarias? | Sí, computan como complementarias. |
| P-07 | Pesos por defecto de RB-01 a RB-06. | Los de la tabla 6.2.2. |
