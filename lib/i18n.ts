import type { Language } from "./types";

/** UI strings. `{name}` placeholders are filled by `t`. */
const en = {
  // Header and first run
  "header.sync": "Sync",
  "header.syncing": "Syncing…",
  "header.resume": "Resume sync",
  "header.settings": "Settings",
  "hero.label": "don't follow you back",
  "hero.stats": "{followers} followers · {following} following · synced {ago}",
  "firstRun.title": "Find who doesn't follow you back",
  "firstRun.sub": "Open instagram.com, log in, then sync.",
  "firstRun.sync": "Sync now",

  // Tabs, toolbar and list
  "tab.review": "To review",
  "tab.kept": "Kept",
  "tab.done": "Unfollowed",
  "search.label": "Search username",
  "search.review": "Search username",
  "search.kept": "Search kept accounts",
  "search.done": "Search unfollowed accounts",
  "filter.title": "Filters",
  "filter.heading": "Show in list",
  "filter.verified": "Verified",
  "filter.verifiedSub": "Brands and creators",
  "filter.private": "Private",
  "filter.privateSub": "Accounts you can't preview",
  "caption.kept":
    "Kept accounts never show up for review. Remove one to review it again.",
  "caption.done":
    "Unfollows you make here or on Instagram. Undo puts an account back in review; it doesn't follow again.",
  "action.keep": "Keep",
  "action.keepTitle": "Never suggest this account (K)",
  "action.remove": "Remove",
  "action.removeTitle": "Review this account again (K)",
  "action.undo": "Undo",
  "action.undoTitle": "Put back in review; does not follow again (U)",
  "action.unfollow": "Unfollow",
  "action.unfollowTitle": "Unfollow @{user} now (⌫)",
  "row.open": "Open @{user} on Instagram",
  "row.unfollowed": "Unfollowed {ago}",
  "empty.noMatches": "No matches.",
  "empty.review": "Nobody left to review.",
  "empty.kept":
    "Accounts you keep show up here. They never show up for review.",
  "empty.done": "Unfollows you make here or on Instagram show up here.",
  "empty.truncated": "Showing {shown} of {total}. Search to narrow down.",

  // Action bar
  "rate.limited": "Limit reached · {time}",
  "rate.today": "{count}/{limit} today",
  "rate.hour": "{count}/{limit} this hour",
  "rate.title":
    "{hour}/{hourLimit} unfollows in the last hour · {day}/{dayLimit} in 24 h",

  // Notices and banners
  "notice.open": "Open",
  "notice.openFirst": "Open Instagram first",
  "notice.openFirstSub": "Open instagram.com in this window, then try again.",
  "notice.reload": "Reload",
  "notice.reloadTitle": "Reload Instagram",
  "notice.reloadSub":
    "Reload the Instagram tab so the extension can connect to it.",
  "notice.loggedOut": "Log in to Instagram",
  "notice.loggedOutSub":
    "Log in on instagram.com in this window, then try again.",
  "notice.synced": "Synced {ago}",
  "notice.syncedRecently": "Synced recently",
  "notice.cooldownSub":
    "You can sync again {time}. Waiting between syncs keeps Instagram from flagging you.",
  "notice.unfollowFailed": "Couldn't unfollow @{user}",
  "notice.syncDone": "Sync complete",
  "notice.syncDoneOne":
    "Found {count} account that doesn't follow you back. Next sync {time}.",
  "notice.syncDoneMany":
    "Found {count} accounts that don't follow you back. Next sync {time}.",
  "notice.syncAvailable": "available now",
  "banner.locked": "Instagram pushed back",
  "banner.lockedSub":
    "Syncs and unfollows are locked until {time}. Your progress is saved.",
  "banner.paused": "Sync paused",
  "banner.pausedSub":
    "{why}. {following} following, {followers} followers fetched so far.",
  "banner.resume": "Resume",
  "banner.stopping": "Stopping…",
  "banner.syncingFollowing": "Syncing following…",
  "banner.syncingFollowers": "Syncing followers…",
  "banner.stop": "Stop",
  "banner.step":
    "Step {step} of 2 · {following} following, {followers} followers fetched",
  "why.stopped": "You stopped it",
  "why.cap": "Reached the per-run account cap",
  "why.blocked": "Instagram pushed back",
  "why.logged_out": "Logged out of Instagram",
  "why.error": "Request failed",
  "why.interrupted": "The Instagram tab reloaded or closed",
  "confirm.limit":
    "You reached your unfollow limit. Next slot {time}.\n\nUnfollow @{user} anyway?",
  "confirm.clear":
    "Delete the synced lists, keep list, unfollow history and settings?",

  // Settings
  "settings.back": "Back",
  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.languageField": "App language",
  "settings.limits": "Unfollow limits",
  "settings.limitsSub":
    "Soft limits. When you reach one, unfollowing asks before going on.",
  "settings.perHour": "Per hour",
  "settings.perDay": "Per 24 hours",
  "settings.pacing": "Sync pacing",
  "settings.pacingSub":
    "Slower is safer. Instagram may lock you out if you go too fast.",
  "settings.minDelay": "Min pause between pages",
  "settings.maxDelay": "Max pause between pages",
  "settings.maxAccounts": "Max accounts per run",
  "settings.cooldown": "Wait between full syncs",
  "settings.lockout": "Lock after Instagram pushes back",
  "settings.debug": "Debug",
  "settings.log": "Activity log",
  "settings.clear": "Clear all data",

  // Activity log
  "log.title": "Activity log",
  "log.copy": "Copy all",
  "log.clear": "Clear",
  "log.empty":
    "Nothing logged yet. Sync, unfollow, or unfollow someone on Instagram.",
  "log.status": "Last 300 entries · tokens are redacted",
  "log.copied": "Copied to the clipboard.",

  // Times
  "time.now": "now",
  "time.inMin": "in {count} min",
  "time.inHours": "in {count} h ({clock})",
  "time.tomorrow": "tomorrow {time}",
  "ago.justNow": "just now",
  "ago.min": "{count} min ago",
  "ago.hours": "{count} h ago",
  "ago.days": "{count} days ago",
};

export type Key = keyof typeof en;

const es: Record<Key, string> = {
  "header.sync": "Sincronizar",
  "header.syncing": "Sincronizando…",
  "header.resume": "Reanudar sincronización",
  "header.settings": "Ajustes",
  "hero.label": "no te siguen de vuelta",
  "hero.stats":
    "{followers} seguidores · {following} seguidos · sincronizado {ago}",
  "firstRun.title": "Descubre quién no te sigue de vuelta",
  "firstRun.sub": "Abre instagram.com, inicia sesión y sincroniza.",
  "firstRun.sync": "Sincronizar ahora",

  "tab.review": "Por revisar",
  "tab.kept": "Conservadas",
  "tab.done": "Dejadas de seguir",
  "search.label": "Buscar usuario",
  "search.review": "Buscar usuario",
  "search.kept": "Buscar cuentas conservadas",
  "search.done": "Buscar cuentas dejadas de seguir",
  "filter.title": "Filtros",
  "filter.heading": "Mostrar en la lista",
  "filter.verified": "Verificadas",
  "filter.verifiedSub": "Marcas y creadores",
  "filter.private": "Privadas",
  "filter.privateSub": "Cuentas que no puedes ver",
  "caption.kept":
    "Las cuentas conservadas nunca aparecen para revisar. Quita una para volver a revisarla.",
  "caption.done":
    "Cuentas que dejaste de seguir aquí o en Instagram. Deshacer devuelve una cuenta a revisión; no la vuelve a seguir.",
  "action.keep": "Conservar",
  "action.keepTitle": "No volver a sugerir esta cuenta (K)",
  "action.remove": "Quitar",
  "action.removeTitle": "Volver a revisar esta cuenta (K)",
  "action.undo": "Deshacer",
  "action.undoTitle": "Devolver a revisión; no la vuelve a seguir (U)",
  "action.unfollow": "Dejar de seguir",
  "action.unfollowTitle": "Dejar de seguir a @{user} ahora (⌫)",
  "row.open": "Abrir @{user} en Instagram",
  "row.unfollowed": "Dejada de seguir {ago}",
  "empty.noMatches": "Sin resultados.",
  "empty.review": "No queda nadie por revisar.",
  "empty.kept":
    "Las cuentas que conserves aparecen aquí. Nunca aparecen para revisar.",
  "empty.done":
    "Las cuentas que dejes de seguir aquí o en Instagram aparecen aquí.",
  "empty.truncated": "Mostrando {shown} de {total}. Busca para acotar.",

  "rate.limited": "Límite alcanzado · {time}",
  "rate.today": "{count}/{limit} hoy",
  "rate.hour": "{count}/{limit} esta hora",
  "rate.title":
    "{hour}/{hourLimit} unfollows en la última hora · {day}/{dayLimit} en 24 h",

  "notice.open": "Abrir",
  "notice.openFirst": "Abre Instagram primero",
  "notice.openFirstSub":
    "Abre instagram.com en esta ventana y vuelve a intentarlo.",
  "notice.reload": "Recargar",
  "notice.reloadTitle": "Recarga Instagram",
  "notice.reloadSub":
    "Recarga la pestaña de Instagram para que la extensión pueda conectarse.",
  "notice.loggedOut": "Inicia sesión en Instagram",
  "notice.loggedOutSub":
    "Inicia sesión en instagram.com en esta ventana y vuelve a intentarlo.",
  "notice.synced": "Sincronizado {ago}",
  "notice.syncedRecently": "Sincronizado hace poco",
  "notice.cooldownSub":
    "Puedes volver a sincronizar {time}. Esperar entre sincronizaciones evita que Instagram te marque.",
  "notice.unfollowFailed": "No se pudo dejar de seguir a @{user}",
  "notice.syncDone": "Sincronización completa",
  "notice.syncDoneOne":
    "Encontramos {count} cuenta que no te sigue de vuelta. Próxima sincronización: {time}.",
  "notice.syncDoneMany":
    "Encontramos {count} cuentas que no te siguen de vuelta. Próxima sincronización: {time}.",
  "notice.syncAvailable": "disponible ahora",
  "banner.locked": "Instagram puso un freno",
  "banner.lockedSub":
    "Sincronizar y dejar de seguir quedan bloqueados hasta {time}. Tu progreso está guardado.",
  "banner.paused": "Sincronización en pausa",
  "banner.pausedSub":
    "{why}. Hasta ahora: {following} seguidos y {followers} seguidores.",
  "banner.resume": "Reanudar",
  "banner.stopping": "Deteniendo…",
  "banner.syncingFollowing": "Sincronizando seguidos…",
  "banner.syncingFollowers": "Sincronizando seguidores…",
  "banner.stop": "Detener",
  "banner.step":
    "Paso {step} de 2 · {following} seguidos y {followers} seguidores obtenidos",
  "why.stopped": "La detuviste",
  "why.cap": "Se alcanzó el máximo de cuentas por ejecución",
  "why.blocked": "Instagram puso un freno",
  "why.logged_out": "Se cerró la sesión de Instagram",
  "why.error": "Falló la solicitud",
  "why.interrupted": "La pestaña de Instagram se recargó o se cerró",
  "confirm.limit":
    "Alcanzaste tu límite para dejar de seguir. Próximo cupo: {time}.\n\n¿Dejar de seguir a @{user} de todas formas?",
  "confirm.clear":
    "¿Borrar las listas sincronizadas, las cuentas conservadas, el historial de unfollows y los ajustes?",

  "settings.back": "Atrás",
  "settings.title": "Ajustes",
  "settings.language": "Idioma",
  "settings.languageField": "Idioma de la app",
  "settings.limits": "Límites para dejar de seguir",
  "settings.limitsSub":
    "Límites flexibles. Al alcanzar uno, se te pedirá confirmación antes de continuar.",
  "settings.perHour": "Por hora",
  "settings.perDay": "Por 24 horas",
  "settings.pacing": "Ritmo de sincronización",
  "settings.pacingSub":
    "Más lento es más seguro. Instagram puede bloquearte si vas demasiado rápido.",
  "settings.minDelay": "Pausa mínima entre páginas",
  "settings.maxDelay": "Pausa máxima entre páginas",
  "settings.maxAccounts": "Máx. de cuentas por ejecución",
  "settings.cooldown": "Espera entre sincronizaciones completas",
  "settings.lockout": "Bloqueo si Instagram pone un freno",
  "settings.debug": "Depuración",
  "settings.log": "Registro de actividad",
  "settings.clear": "Borrar todos los datos",

  "log.title": "Registro de actividad",
  "log.copy": "Copiar todo",
  "log.clear": "Borrar",
  "log.empty":
    "Aún no hay registros. Sincroniza o deja de seguir a alguien, aquí o en Instagram.",
  "log.status": "Últimas 300 entradas · los tokens se ocultan",
  "log.copied": "Copiado al portapapeles.",

  "time.now": "ahora",
  "time.inMin": "en {count} min",
  "time.inHours": "en {count} h ({clock})",
  "time.tomorrow": "mañana {time}",
  "ago.justNow": "hace un momento",
  "ago.min": "hace {count} min",
  "ago.hours": "hace {count} h",
  "ago.days": "hace {count} días",
};

export const STRINGS: Record<Language, Record<Key, string>> = { en, es };

/** Locale for numbers, dates and times in each language. */
const LOCALES: Record<Language, string> = { en: "en-US", es: "es" };

let lang: Language = "en";

/** Switches the UI language. Returns whether it changed. */
export function setLanguage(next: Language): boolean {
  const valid = next in STRINGS ? next : "en";
  if (valid === lang) return false;
  lang = valid;
  return true;
}

export const language = () => lang;
export const locale = () => LOCALES[lang];

export function t(key: Key, vars: Record<string, string | number> = {}) {
  return STRINGS[lang][key].replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}
