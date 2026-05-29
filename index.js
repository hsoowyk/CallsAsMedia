"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const metro_1 = require("@vendetta/metro");
const patcher_1 = require("@vendetta/patcher");
const toasts_1 = require("@vendetta/ui/toasts");
// ─── Patch storage ───────────────────────────────────────────────────────────
const patches = [];
// ─── Find relevant modules ───────────────────────────────────────────────────
// Módulo responsável por tratar notificações de chamada (ringtone, vibração etc.)
const CallModule = (0, metro_1.findByProps)("ringIncomingCall", "stopRinging");
// Módulo de notificações nativas do Android/iOS
const NotificationModule = (0, metro_1.findByProps)("showNotification", "localNotification");
// Módulo de canal de notificação
const NotificationChannelModule = (0, metro_1.findByProps)("setNotificationChannel", "INCOMING_CALL_CHANNEL", "DEFAULT_CHANNEL");
// Módulo que decide o tipo de notificação a ser exibida
const PushNotificationModule = (0, metro_1.findByProps)("handlePushNotification", "handleNotification");
// ─── Plugin lifecycle ─────────────────────────────────────────────────────────
exports.default = {
    onLoad() {
        // 1) Impede que o Discord toque o ringtone de chamada
        if (CallModule === null || CallModule === void 0 ? void 0 : CallModule.ringIncomingCall) {
            patches.push((0, patcher_1.before)("ringIncomingCall", CallModule, (args) => {
                // Retorna false-ish / cancela a execução original
                return [null];
            }));
        }
        // 2) Impede que o Discord pare o ringing (não precisamos parar o que não tocou)
        if (CallModule === null || CallModule === void 0 ? void 0 : CallModule.stopRinging) {
            patches.push((0, patcher_1.before)("stopRinging", CallModule, () => {
                return [];
            }));
        }
        // 3) Redireciona notificações de chamada para o canal de mídia padrão
        if (NotificationChannelModule) {
            // Sobrescreve o canal de chamadas para usar o canal padrão de notificações
            patches.push((0, patcher_1.instead)("setNotificationChannel", NotificationChannelModule, (args, orig) => {
                var _a;
                // Se o canal for o de chamadas, troca para o canal padrão (mídia/mensagens)
                if (args[0] === NotificationChannelModule.INCOMING_CALL_CHANNEL ||
                    String(args[0]).toLowerCase().includes("call")) {
                    args[0] =
                        (_a = NotificationChannelModule.DEFAULT_CHANNEL) !== null && _a !== void 0 ? _a : "com.discord.default";
                }
                return orig(...args);
            }));
        }
        // 4) Patch principal: intercepta notificações push do tipo CALL e as reescreve como MESSAGE
        if (PushNotificationModule === null || PushNotificationModule === void 0 ? void 0 : PushNotificationModule.handlePushNotification) {
            patches.push((0, patcher_1.before)("handlePushNotification", PushNotificationModule, (args) => {
                var _a, _b, _c;
                const payload = args[0];
                if (!payload)
                    return;
                // Tipos conhecidos de notificação de chamada no Discord
                const callTypes = [
                    "CALL",
                    "incoming_call",
                    "voice_channel_effect",
                    "RING",
                ];
                if (payload.type &&
                    callTypes.some((t) => String(payload.type).toUpperCase().includes(t.toUpperCase()))) {
                    // Reescreve o payload para parecer uma mensagem/mídia
                    args[0] = Object.assign(Object.assign({}, payload), { type: "MESSAGE", 
                        // Remove flags que acionam o comportamento de chamada full-screen
                        call: undefined, ring: undefined, channelType: undefined, 
                        // Mantém título e corpo mas reformata
                        title: (_a = payload.title) !== null && _a !== void 0 ? _a : "📞 Chamada recebida", body: (_b = payload.body) !== null && _b !== void 0 ? _b : `${(_c = payload.sender) !== null && _c !== void 0 ? _c : "Alguém"} está te chamando`, 
                        // Força ícone de mensagem padrão
                        smallIcon: "ic_notification", notificationCategory: "message" });
                }
            }));
        }
        // 5) Patch no handleNotification (caminho alternativo usado em algumas versões)
        if (PushNotificationModule === null || PushNotificationModule === void 0 ? void 0 : PushNotificationModule.handleNotification) {
            patches.push((0, patcher_1.before)("handleNotification", PushNotificationModule, (args) => {
                var _a;
                const notification = args[0];
                if (!notification)
                    return;
                if (notification.call ||
                    notification.ring ||
                    String((_a = notification.type) !== null && _a !== void 0 ? _a : "").toUpperCase().includes("CALL")) {
                    args[0] = Object.assign(Object.assign({}, notification), { call: undefined, ring: undefined, type: "message", importance: 3, category: "msg" });
                }
            }));
        }
        (0, toasts_1.showToast)("CallsAsMedia ativado ✅", { key: "calls-as-media" });
    },
    onUnload() {
        // Remove todos os patches ao desativar
        patches.forEach((unpatch) => unpatch());
        patches.length = 0;
        (0, toasts_1.showToast)("CallsAsMedia desativado ❌", { key: "calls-as-media" });
    },
};
