import { Platform } from "react-native";

export function receiverCodeMessage(reference: string, code: string) {
  return `Passenger delivery code for ${reference}: ${code}. Share this only after you receive and check the parcel.`;
}

export function receiverCodeSmsUrl(phone: string, message: string) {
  const separator = Platform.OS === "ios" ? "&" : "?";
  return `sms:${phone}${separator}body=${encodeURIComponent(message)}`;
}

export function receiverCodeWhatsAppUrl(phone: string, message: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}
