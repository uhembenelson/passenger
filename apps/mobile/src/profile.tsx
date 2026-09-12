import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  ArrowUp,
  Banknote,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  LogOut,
  Pencil,
  Package,
  Plus,
  Trash2,
  Upload,
  UserCheck,
  Wallet,
  X,
} from "lucide-react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import { isPlaceholderPhone, type Person } from "@passenger/core";
import { primitives, semantic } from "@passenger/design-tokens";
import { usePassenger } from "./data";
import { getPendingEvidenceResumeKey } from "./evidence";
import { IdentityVerification } from "./identity-verification";
import { TopUpSheet, WalletTransactionHistory } from "./wallet";
import { BackButton,
  Avatar,
  Badge,
  Button,
  Card,
  Check as CheckBox,
  colors,
  errorMessage,
  Field,
  fontFamily,
  Notice,
  PresentationSheet,
  s,
  SectionTitle,
  Txt,
} from "./ui";

import { EarningsScreen } from "./earnings";
import { ParcelHistory } from "./parcel-history";

type SubScreen = "earnings" | "menu" | "personal_info" | "account_tier" | "wallet" | "parcel_history";
type ChangePasswordStep = null | "phone" | "otp";

export function Profile({
  viewer: propViewer,
  navigation,
  onToast,
  onSafety,
  onOpenDelivery,
  onStartEarning,
}: {
  viewer?: Person;
  navigation?: React.ReactNode;
  onToast?: (message: string) => void;
  onSafety?: () => void;
  onOpenDelivery?: (id: string) => void;
  onStartEarning?: () => void;
}) {
  const data = usePassenger();
  const viewer = propViewer ?? data.snapshot?.viewer;

  const [subScreen, setSubScreen] = useState<SubScreen>("menu");
  const [changePasswordStep, setChangePasswordStep] = useState<ChangePasswordStep>(null);
  const [toastMessage, setToastMessage] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  if (!viewer) return null;

  useEffect(() => {
    void (async () => {
      try {
        const pendingResume = await getPendingEvidenceResumeKey();
        if (pendingResume === "tier2-identity") setSubScreen("account_tier");
      } catch {
        // Ignore resume key error
      }
    })();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (onToast) onToast(msg);
    setTimeout(() => setToastMessage(""), 5000);
  };

  return (
    <View style={p.screen}>
      {data.offline ? <Notice tone="warning">You're offline. Profile changes are disabled until you reconnect.</Notice> : null}
      {subScreen === "menu" && (
        <ProfileMenuView
          viewer={viewer}
          onSelect={(target) => setSubScreen(target)}
          onDeleteAccount={() => setDeleteModalOpen(true)}
          onLogout={() => setLogoutModalOpen(true)}
        />
      )}

      {subScreen === "personal_info" && (
        <PersonalInformationView
          viewer={viewer}
          toastMessage={toastMessage}
          onBack={() => setSubScreen("menu")}
          onChangePassword={() => setChangePasswordStep("phone")}
          onToast={showToast}
        />
      )}

      {subScreen === "account_tier" && (
        <AccountTierView
          viewer={viewer}
          onBack={() => setSubScreen("menu")}
          onToast={showToast}
          autoOpenTier2={subScreen === "account_tier"}
        />
      )}

      {subScreen === "wallet" && (
        <WalletScreenView
          onBack={() => setSubScreen("menu")}
        />
      )}

      {subScreen === "earnings" && <EarningsScreen onBack={() => setSubScreen("menu")} onStartEarning={onStartEarning} />}

      {subScreen === "parcel_history" && <ParcelHistory onBack={() => setSubScreen("menu")} />}

      {changePasswordStep !== null && (
        <ChangePasswordModal
          step={changePasswordStep}
          initialPhone={viewer.phone}
          onClose={() => setChangePasswordStep(null)}
          onStepChange={setChangePasswordStep}
          onSuccess={() => {
            setChangePasswordStep(null);
            showToast("Phone number verified.");
          }}
        />
      )}

      {deleteModalOpen && (
        <DeleteAccountModal
          onClose={() => setDeleteModalOpen(false)}
        />
      )}

      {logoutModalOpen && (
        <LogoutModal
          onClose={() => setLogoutModalOpen(false)}
          onConfirm={async () => {
            setLogoutModalOpen(false);
            await data.signOut();
          }}
        />
      )}

      {navigation}
    </View>
  );
}

// -------------------------------------------------------------
// Screen 1: Main Profile Menu (Matches Image 1)
// -------------------------------------------------------------
function ProfileMenuView({
  viewer,
  onSelect,
  onDeleteAccount,
  onLogout,
}: {
  viewer: Person;
  onSelect: (target: SubScreen) => void;
  onDeleteAccount: () => void;
  onLogout: () => void;
}) {
  const isVerified = viewer.verification === "verified";
  const tierLabel = viewer.tier || (isVerified ? "Tier 2" : "Tier 1");

  return (
    <ScrollView contentContainerStyle={p.scroll}>
      <Txt style={p.mainTitle}>Profile</Txt>

      <View style={p.userRow}>
        <Avatar name={viewer.name} size={64} uri={viewer.image} />
        <View style={{ marginLeft: 16, flex: 1 }}>
          <Txt style={p.userName}>{viewer.name}</Txt>
          <Txt style={p.userSubtitle}>{tierLabel}</Txt>
        </View>
      </View>

      <View style={p.divider} />

      <View style={p.menuList}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelect("personal_info")}
          style={p.menuItem}
        >
          <View style={p.menuLeft}>
            <FileText size={22} color="#1F2937" strokeWidth={1.8} />
            <Txt style={p.menuLabel}>Personal Information</Txt>
          </View>
          <ChevronRight size={20} color="#9CA3AF" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => onSelect("account_tier")}
          style={p.menuItem}
        >
          <View style={p.menuLeft}>
            <UserCheck size={22} color="#1F2937" strokeWidth={1.8} />
            <Txt style={p.menuLabel}>Account Tier</Txt>
          </View>
          <View style={[s.row, { alignItems: "center" }]}>
            <View style={[p.tierBadge, isVerified && p.tierBadgeVerified]}>
              <Txt style={[p.tierBadgeText, isVerified && p.tierBadgeTextVerified]}>
                {isVerified ? "Verified" : "Upgrade"}
              </Txt>
            </View>
            <ChevronRight size={20} color="#9CA3AF" />
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => onSelect("wallet")}
          style={p.menuItem}
        >
          <View style={p.menuLeft}>
            <Wallet size={22} color="#1F2937" strokeWidth={1.8} />
            <Txt style={p.menuLabel}>Wallet</Txt>
          </View>
          <ChevronRight size={20} color="#9CA3AF" />
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => onSelect("earnings")} style={p.menuItem}>
          <View style={p.menuLeft}><Banknote size={22} color="#1F2937" strokeWidth={1.8} /><Txt style={p.menuLabel}>Earnings</Txt></View>
          <ChevronRight size={20} color="#9CA3AF" />
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => onSelect("parcel_history")} style={p.menuItem}>
          <View style={p.menuLeft}><Package size={22} color="#1F2937" strokeWidth={1.8} /><Txt style={p.menuLabel}>Parcel history</Txt></View>
          <ChevronRight size={20} color="#9CA3AF" />
        </Pressable>


        <Pressable
          accessibilityRole="button"
          onPress={onDeleteAccount}
          style={p.menuItem}
        >
          <View style={p.menuLeft}>
            <Trash2 size={22} color="#1F2937" strokeWidth={1.8} />
            <Txt style={p.menuLabel}>Delete Account</Txt>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={onLogout}
          style={p.menuItem}
        >
          <View style={p.menuLeft}>
            <LogOut size={22} color="#1F2937" strokeWidth={1.8} />
            <Txt style={p.menuLabel}>Logout</Txt>
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// -------------------------------------------------------------
// Screen 2: Personal Information (Matches Image 2)
// -------------------------------------------------------------
function PersonalInformationView({
  viewer,
  toastMessage,
  onBack,
  onChangePassword,
  onToast,
}: {
  viewer: Person;
  toastMessage: string;
  onBack: () => void;
  onChangePassword: () => void;
  onToast: (msg: string) => void;
}) {
  const data = usePassenger();
  const [email, setEmail] = useState(viewer.email ?? "");
  const [editingEmail, setEditingEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");

  const handlePickPhoto = async () => {
    setPhotoBusy(true);
    setError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Permission to access photo library is required.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        await data.updateProfileImage({ uri: result.assets[0].uri, contentType: result.assets[0].mimeType });
        onToast("Profile photo updated.");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!editingEmail) {
      setEditingEmail(true);
      return;
    }
    setError("");
    setBusy(true);
    try {
      await data.updateContactDetails({ email: email.trim() });
      setEditingEmail(false);
      onToast("Email address updated.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={p.scroll}>
      <View style={p.headerNav}>
        <BackButton accessibilityLabel="Back to profile" onPress={onBack} />
        {toastMessage !== "" && (
          <View style={p.toastPill}>
            <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
            <Txt style={p.toastText}>{toastMessage}</Txt>
          </View>
        )}
        {viewer.verification === "pending" ? <Notice tone="warning">Your identity is under review. Passenger will update this screen when operations completes the review.</Notice> : null}
        {viewer.verification === "rejected" && viewer.identityNote ? <Notice tone="error">{viewer.identityNote}</Notice> : null}
      </View>

      <View style={p.avatarCentered}>
        <View style={p.avatarWrap}>
          <Avatar name={viewer.name} size={96} uri={viewer.image} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            onPress={handlePickPhoto}
            disabled={photoBusy}
            style={p.editAvatarBadge}
          >
            {photoBusy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Pencil size={15} color="#FFFFFF" strokeWidth={2.2} />}
          </Pressable>
        </View>
        <Txt style={p.personalName}>{viewer.name}</Txt>
        <Txt style={p.personalPhone}>{viewer.phone}</Txt>
      </View>

      {error !== "" && <Notice tone="error">{error}</Notice>}

      <View style={p.formSection}>
        <Txt style={p.sectionLabel}>Email Address</Txt>
        <TextInput
          accessibilityLabel="Email address"
          value={email}
          onChangeText={setEmail}
          placeholder="Enter your email address"
          placeholderTextColor="#9CA3AF"
          keyboardType="email-address"
          autoCapitalize="none"
          editable={editingEmail && !busy}
          style={[p.inputBox, editingEmail && p.inputBoxActive]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={handleSaveEmail}
          disabled={busy}
          style={p.greenButtonSmall}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Txt style={p.greenButtonText}>{editingEmail ? "Save" : "Edit"}</Txt>
          )}
        </Pressable>
      </View>

      <View style={p.formSection}>
        <Txt style={p.sectionHeading}>Phone security</Txt>
        <Pressable
          accessibilityRole="button"
          onPress={onChangePassword}
          style={p.passwordRow}
        >
          <Txt style={p.passwordRowText}>{viewer.phoneVerificationTime ? "Change verified phone number" : "Verify phone number"}</Txt>
          <ChevronRight size={18} color="#9CA3AF" />
        </Pressable>
        <View style={p.thinDivider} />
      </View>
    </ScrollView>
  );
}

// -------------------------------------------------------------
// Phone verification flow
// -------------------------------------------------------------
function ChangePasswordModal({
  step,
  initialPhone,
  onClose,
  onStepChange,
  onSuccess,
}: {
  step: "phone" | "otp";
  initialPhone: string;
  onClose: () => void;
  onStepChange: (step: "phone" | "otp") => void;
  onSuccess: () => void;
}) {
  const data = usePassenger();
  const [phone, setPhone] = useState(isPlaceholderPhone(initialPhone) ? "" : initialPhone);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(63);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (step !== "otp") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step]);

  const handleSendOTP = async () => {
    if (!phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const result = await data.requestPhoneVerification(phone.trim());
      setCode(result.previewCode ?? "");
      setCountdown(Math.max(0, Math.ceil((result.resendAt - Date.now()) / 1000)));
      onStepChange("otp");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (code.trim().length !== 6) {
      setError("Enter the 6-digit verification code.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await data.confirmPhoneVerification(code.trim());
      onSuccess();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setError("");
    setBusy(true);
    try {
      const result = await data.requestPhoneVerification(phone.trim());
      setCode(result.previewCode ?? "");
      setCountdown(Math.max(0, Math.ceil((result.resendAt - Date.now()) / 1000)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <PresentationSheet
      title={step === "phone" ? "Verify Phone Number" : "Enter verification code"}
      onClose={onClose}
    >
      <View style={{ gap: 16 }}>
        {error !== "" && <Notice tone="error">{error}</Notice>}

        {step === "phone" ? (
          <View style={{ gap: 14 }}>
            <Txt style={p.modalLabel}>Enter your phone number</Txt>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="08132417465"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              autoFocus
              style={p.inputBox}
            />

            <Pressable
              accessibilityRole="button"
              onPress={handleSendOTP}
              disabled={busy}
              style={[p.greenButtonFull, { marginTop: 12 }]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Txt style={p.greenButtonFullText}>Send OTP</Txt>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 20 }}>
            <Txt style={p.otpDescription}>
              A 6-digit code was sent to {phone} via SMS. Enter code
            </Txt>

            <OtpInputBoxes code={code} onChange={setCode} />

            <View style={p.resendRow}>
              <Txt style={p.timerText}>{formatTimer(countdown)}</Txt>
              <Pressable
                accessibilityRole="button"
                onPress={handleResend}
                disabled={countdown > 0 || busy}
              >
                <Txt style={[p.resendButtonText, countdown > 0 && { opacity: 0.4 }]}>
                  Resend code
                </Txt>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={handleVerify}
              disabled={busy || code.trim().length !== 6}
              style={[
                p.greenButtonFull,
                { marginTop: 12 },
                code.trim().length !== 6 && { opacity: 0.6 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Txt style={p.greenButtonFullText}>Verify</Txt>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </PresentationSheet>
  );
}

// -------------------------------------------------------------
// 6-box OTP entry component (Matches Image 5)
// -------------------------------------------------------------
function OtpInputBoxes({
  code,
  onChange,
}: {
  code: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<TextInput>(null);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={p.otpContainer}>
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={(text) => onChange(text.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        style={p.hiddenInput}
        autoFocus
      />
      <View style={p.otpBoxesRow}>
        {[0, 1, 2, 3, 4, 5].map((index) => {
          const digit = code[index] ?? "";
          const isFocused = code.length === index;
          return (
            <View
              key={index}
              style={[
                p.otpBox,
                isFocused && p.otpBoxFocused,
                digit !== "" && p.otpBoxFilled,
              ]}
            >
              <Txt style={p.otpDigit}>{digit}</Txt>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

// -------------------------------------------------------------
// Screen 3: Account Tier & Upgrade View (Matches Images 1-10)
// -------------------------------------------------------------
function AccountTierView({
  viewer,
  onBack,
  onToast,
  autoOpenTier2,
}: {
  viewer: Person;
  onBack: () => void;
  onToast: (msg: string) => void;
  autoOpenTier2?: boolean;
}) {
  const currentTier = viewer.tier ?? (viewer.verification === "verified" ? "Tier 2" : "Tier 1");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    if (currentTier === "Tier 3") return { tier1: false, tier2: false, tier3: true };
    if (currentTier === "Tier 2") return { tier1: false, tier2: true, tier3: true };
    return { tier1: true, tier2: true, tier3: false };
  });

  const [toastMessage, setToastMessage] = useState("");
  const [tier2ModalOpen, setTier2ModalOpen] = useState(false);
  const [locationPromptOpen, setLocationPromptOpen] = useState(false);
  const [tier3ModalOpen, setTier3ModalOpen] = useState(false);

  useEffect(() => {
    if (currentTier === "Tier 3") {
      setExpanded({ tier1: false, tier2: false, tier3: true });
    } else if (currentTier === "Tier 2") {
      setExpanded({ tier1: false, tier2: true, tier3: true });
    } else {
      setExpanded({ tier1: true, tier2: true, tier3: false });
    }
  }, [currentTier]);

  useEffect(() => {
    if (!autoOpenTier2) return;
    void (async () => {
      try {
        const pendingResume = await getPendingEvidenceResumeKey();
        if (pendingResume === "tier2-identity") setTier2ModalOpen(true);
      } catch {
        // Ignore resume key error
      }
    })();
  }, [autoOpenTier2]);

  const toggleTier = (key: "tier1" | "tier2" | "tier3") => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTier2Success = () => {
    setTier2ModalOpen(false);
    setToastMessage("Your identity was submitted for review");
    onToast("Identity submitted for review");
  };

  const handleTier3Success = () => {
    setTier3ModalOpen(false);
    setToastMessage("You’ve been successfully upgraded to Tier 3");
    onToast("Upgraded to Tier 3");
  };

  return (
    <View style={tierStyles.container}>
      <ScrollView contentContainerStyle={tierStyles.scrollContent}>
        {/* Header */}
        <View style={tierStyles.header}>
          <BackButton accessibilityLabel="Back to profile" onPress={onBack} />
          <Txt style={tierStyles.headerTitle}>Account Tier</Txt>
          <View style={{ width: 24 }} />
        </View>

        {/* Success Toast Banner */}
        {toastMessage !== "" && (
          <View style={tierStyles.toastBanner}>
            <View style={tierStyles.toastIconCircle}>
              <Check size={14} color={semantic.color.action.primary} strokeWidth={3} />
            </View>
            <Txt style={tierStyles.toastBannerText}>{toastMessage}</Txt>
          </View>
        )}

        {/* Tier Cards List */}
        <View style={tierStyles.cardsList}>
          {/* Tier 1 Card */}
          <View style={tierStyles.card}>
            <Pressable
              accessibilityRole="button"
              onPress={() => toggleTier("tier1")}
              style={tierStyles.cardHeader}
            >
              <View style={tierStyles.cardHeaderLeft}>
                <Txt style={tierStyles.tierName}>Tier 1</Txt>
                {currentTier === "Tier 1" && (
                  <View style={tierStyles.currentBadge}>
                    <Txt style={tierStyles.currentBadgeText}>Current</Txt>
                  </View>
                )}
              </View>
              {expanded.tier1 ? (
                <ChevronUp size={20} color="#1F2937" />
              ) : (
                <ChevronDown size={20} color="#1F2937" />
              )}
            </Pressable>

            {expanded.tier1 && (
              <View style={tierStyles.cardBody}>
                <View style={tierStyles.divider} />
                <Txt style={tierStyles.tierDescription}>
                  Find Travellers and view their trip details.
                </Txt>
              </View>
            )}
          </View>

          {/* Tier 2 Card */}
          <View style={tierStyles.card}>
            <Pressable
              accessibilityRole="button"
              onPress={() => toggleTier("tier2")}
              style={tierStyles.cardHeader}
            >
              <View style={tierStyles.cardHeaderLeft}>
                <Txt style={tierStyles.tierName}>Tier 2</Txt>
                {currentTier === "Tier 2" ? (
                  <View style={tierStyles.currentBadge}>
                    <Txt style={tierStyles.currentBadgeText}>Current</Txt>
                  </View>
                ) : currentTier === "Tier 1" ? (
                  <View style={tierStyles.nextBadge}>
                    <Txt style={tierStyles.nextBadgeText}>Next</Txt>
                  </View>
                ) : null}
              </View>
              {expanded.tier2 ? (
                <ChevronUp size={20} color="#1F2937" />
              ) : (
                <ChevronDown size={20} color="#1F2937" />
              )}
            </Pressable>

            {expanded.tier2 && (
              <View style={tierStyles.cardBody}>
                <View style={tierStyles.divider} />
                <View style={tierStyles.bulletList}>
                  <View style={tierStyles.bulletRow}>
                    <Txt style={tierStyles.bulletDot}>•</Txt>
                    <Txt style={tierStyles.bulletText}>Book travellers for delivery.</Txt>
                  </View>
                  <View style={tierStyles.bulletRow}>
                    <Txt style={tierStyles.bulletDot}>•</Txt>
                    <Txt style={tierStyles.bulletText}>Contact travellers.</Txt>
                  </View>
                  <View style={tierStyles.bulletRow}>
                    <Txt style={tierStyles.bulletDot}>•</Txt>
                    <Txt style={tierStyles.bulletText}>Schedule Trips.</Txt>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Tier 3 Card */}
          <View style={tierStyles.card}>
            <Pressable
              accessibilityRole="button"
              onPress={() => toggleTier("tier3")}
              style={tierStyles.cardHeader}
            >
              <View style={tierStyles.cardHeaderLeft}>
                <Txt style={tierStyles.tierName}>Tier 3</Txt>
                {currentTier === "Tier 3" ? (
                  <View style={tierStyles.currentBadge}>
                    <Txt style={tierStyles.currentBadgeText}>Current</Txt>
                  </View>
                ) : currentTier === "Tier 2" ? (
                  <View style={tierStyles.nextBadge}>
                    <Txt style={tierStyles.nextBadgeText}>Next</Txt>
                  </View>
                ) : null}
              </View>
              {expanded.tier3 ? (
                <ChevronUp size={20} color="#1F2937" />
              ) : (
                <ChevronDown size={20} color="#1F2937" />
              )}
            </Pressable>

            {expanded.tier3 && (
              <View style={tierStyles.cardBody}>
                <View style={tierStyles.divider} />
                <Txt style={tierStyles.tierDescription}>
                  Get the ability to deliver high value parcels.
                </Txt>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Bottom Floating Upgrade Button */}
      {currentTier === "Tier 1" && viewer.verification !== "pending" && (
        <View style={tierStyles.footer}>
          {!viewer.phoneVerificationTime ? <Notice tone="warning">Verify your phone number from Home before submitting identity evidence.</Notice> : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => setTier2ModalOpen(true)}
            disabled={!viewer.phoneVerificationTime}
            style={[tierStyles.greenPillButton, !viewer.phoneVerificationTime && { opacity: 0.5 }]}
          >
            <Txt style={tierStyles.greenPillButtonText}>{viewer.verification === "rejected" ? "Resubmit identity" : "Verify my identity"}</Txt>
          </Pressable>
        </View>
      )}

      {currentTier === "Tier 2" ? <View style={tierStyles.footer}><Notice>Higher-value delivery access is assigned only after an operations review. No automatic in-app upgrade is available.</Notice></View> : null}

      {/* Upgrade to Tier 2 Modal */}
      <UpgradeToTier2Modal
        visible={tier2ModalOpen}
        viewer={viewer}
        onClose={() => setTier2ModalOpen(false)}
        onSuccess={handleTier2Success}
      />

    </View>
  );
}

// -------------------------------------------------------------
// Upgrade to Tier 2 Modal (Matches Images 3, 4)
// -------------------------------------------------------------
function UpgradeToTier2Modal({
  visible,
  viewer,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  viewer: Person;
  onClose: () => void;
  onSuccess: () => void;
}) {
  return visible ? <IdentityVerification viewer={viewer} onClose={onClose} onSuccess={onSuccess} /> : null;
}

// -------------------------------------------------------------
// Location Permission Dialog (Matches Image 5)
// -------------------------------------------------------------
function LocationPermissionModal({
  visible,
  onAllow,
  onDeny,
}: {
  visible: boolean;
  onAllow: () => void;
  onDeny: () => void;
}) {
  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onDeny}>
      <Pressable style={tierStyles.permissionOverlay} onPress={onDeny}>
        <Pressable style={tierStyles.permissionCard} onPress={(e) => e.stopPropagation?.()}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close dialog"
            onPress={onDeny}
            style={tierStyles.permissionCloseBtn}
          >
            <X size={20} color="#1F2937" strokeWidth={2} />
          </Pressable>

          <Txt style={tierStyles.permissionTitle}>
            Allow <Txt style={{ color: semantic.color.action.primary }}>“Passenger App”</Txt> to access your location while you use the app?
          </Txt>

          <Txt style={tierStyles.permissionSubtitle}>
            We’ll use your location to verify your home adress.
          </Txt>

          <View style={tierStyles.permissionButtons}>
            <Pressable
              accessibilityRole="button"
              onPress={onAllow}
              style={tierStyles.greenPillButton}
            >
              <Txt style={tierStyles.greenPillButtonText}>Allow</Txt>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={onDeny}
              style={tierStyles.outlinePillButton}
            >
              <Txt style={tierStyles.outlinePillButtonText}>Don’t Allow</Txt>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// -------------------------------------------------------------
// Upgrade to Tier 3 Modal (Matches Images 6-9)
// -------------------------------------------------------------
function UpgradeToTier3Modal({
  visible,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  if (!visible) return null;
  const data = usePassenger();
  const residenceConfig = data.snapshot?.mobileConfig?.residence;
  const statesList = residenceConfig?.states ?? [];
  const lgaList = residenceConfig?.localGovernmentAreas ?? [];
  const [step, setStep] = useState<1 | 2>(1);
  const [state, setState] = useState(residenceConfig?.defaultState ?? "");
  const [lga, setLga] = useState(residenceConfig?.defaultLocalGovernmentArea ?? "");
  const [address, setAddress] = useState("");
  const [streetPhoto, setStreetPhoto] = useState("");
  const [housePhoto, setHousePhoto] = useState("");
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [lgaPickerOpen, setLgaPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handlePickStreetPhoto = async () => {
    setError("");
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (!res.canceled && res.assets[0]?.uri) {
        setStreetPhoto(res.assets[0].fileName || "street-photo.jpg");
      }
    } catch (e) {
      setError(errorMessage(e, "Could not select street photo. Please try again."));
    }
  };

  const handlePickHousePhoto = async () => {
    setError("");
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (!res.canceled && res.assets[0]?.uri) {
        setHousePhoto(res.assets[0].fileName || "house-photo.jpg");
      }
    } catch (e) {
      setError(errorMessage(e, "Could not select house photo. Please try again."));
    }
  };

  const handleContinue = () => {
    if (!state.trim()) {
      setError("Please select your state of residence.");
      return;
    }
    if (!lga.trim()) {
      setError("Please select your local government of residence.");
      return;
    }
    if (!address.trim()) {
      setError("Please enter your home address.");
      return;
    }
    setError("");
    setStep(2);
  };

  const handleFinalSubmit = async () => {
    if (!streetPhoto) {
      setError("Please select a picture of your street.");
      return;
    }
    if (!housePhoto) {
      setError("Please select a picture of your house.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await data.upgradeToTier3({
        state,
        lga,
        address,
        streetPhotoUrl: streetPhoto,
        housePhotoUrl: housePhoto,
      });
      setStep(1);
      onSuccess();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PresentationSheet title="Upgrade to Tier 3" onClose={onClose}>
      <View style={{ gap: 16 }}>
        {error !== "" && <Notice tone="error">{error}</Notice>}

        {step === 1 ? (
          <View style={{ gap: 16 }}>
            <Txt style={tierStyles.stepSubheading}>Residence address</Txt>

            <View style={{ gap: 8 }}>
              <Txt style={tierStyles.fieldLabel}>State of Residence</Txt>
              <Pressable
                accessibilityRole="button"
                onPress={() => setStatePickerOpen(!statePickerOpen)}
                style={tierStyles.dropdownSelector}
              >
                <Txt style={tierStyles.dropdownSelectorText}>{state}</Txt>
                <ChevronDown size={20} color="#1F2937" />
              </Pressable>
              {statePickerOpen && (
                <View style={tierStyles.pickerList}>
                  {statesList.map((item) => (
                    <Pressable
                      key={item}
                      onPress={() => {
                        setState(item);
                        setStatePickerOpen(false);
                      }}
                      style={tierStyles.pickerItem}
                    >
                      <Txt style={[tierStyles.pickerItemText, state === item && { color: semantic.color.action.primary, fontFamily: fontFamily.semibold }]}>
                        {item}
                      </Txt>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View style={{ gap: 8 }}>
              <Txt style={tierStyles.fieldLabel}>Local Govt of Residence</Txt>
              <Pressable
                accessibilityRole="button"
                onPress={() => setLgaPickerOpen(!lgaPickerOpen)}
                style={tierStyles.dropdownSelector}
              >
                <Txt style={tierStyles.dropdownSelectorText}>{lga}</Txt>
                <ChevronDown size={20} color="#1F2937" />
              </Pressable>
              {lgaPickerOpen && (
                <View style={tierStyles.pickerList}>
                  {lgaList.map((item) => (
                    <Pressable
                      key={item}
                      onPress={() => {
                        setLga(item);
                        setLgaPickerOpen(false);
                      }}
                      style={tierStyles.pickerItem}
                    >
                      <Txt style={[tierStyles.pickerItemText, lga === item && { color: semantic.color.action.primary, fontFamily: fontFamily.semibold }]}>
                        {item}
                      </Txt>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View style={{ gap: 8 }}>
              <Txt style={tierStyles.fieldLabel}>Home Address</Txt>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="No 24, Wisdom Street, Jos"
                placeholderTextColor="#9CA3AF"
                style={tierStyles.whiteInputBox}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={handleContinue}
              style={[tierStyles.greenPillButton, { marginTop: 12 }]}
            >
              <Txt style={tierStyles.greenPillButtonText}>Continue</Txt>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 20 }}>
            <Txt style={tierStyles.stepSubheading}>Residence evidence</Txt>

            <View style={{ gap: 8 }}>
              <Txt style={tierStyles.fieldLabel}>Upload a picture of your street</Txt>
              <Pressable
                accessibilityRole="button"
                onPress={handlePickStreetPhoto}
                style={tierStyles.uploadBox}
              >
                <View style={tierStyles.uploadInnerRow}>
                  <Upload size={22} color={semantic.color.action.primary} strokeWidth={2.2} />
                  <Txt style={tierStyles.uploadedFileLink}>
                    {streetPhoto !== "" ? streetPhoto : "Select street photo"}
                  </Txt>
                </View>
              </Pressable>
            </View>

            <View style={{ gap: 8 }}>
              <Txt style={tierStyles.fieldLabel}>Upload a picture of your house</Txt>
              <Pressable
                accessibilityRole="button"
                onPress={handlePickHousePhoto}
                style={tierStyles.uploadBox}
              >
                <View style={tierStyles.uploadInnerRow}>
                  <Upload size={22} color={semantic.color.action.primary} strokeWidth={2.2} />
                  <Txt style={tierStyles.uploadedFileLink}>
                    {housePhoto !== "" ? housePhoto : "Select house photo"}
                  </Txt>
                </View>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={handleFinalSubmit}
              disabled={busy}
              style={[tierStyles.greenPillButton, { marginTop: 12 }]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Txt style={tierStyles.greenPillButtonText}>Upgrade to Tier 3</Txt>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </PresentationSheet>
  );
}

// -------------------------------------------------------------
// Screen 4: Wallet Screen View (Matches media_1788944713709.png)
// -------------------------------------------------------------
function WalletScreenView({ onBack }: { onBack: () => void }) {
  const { snapshot } = usePassenger();
  const [topUpOpen, setTopUpOpen] = useState(false);

  const balance = snapshot?.viewer?.walletBalanceNaira ?? 0;

  return (
    <View style={walletViewStyles.container}>
      <ScrollView contentContainerStyle={walletViewStyles.scrollContent}>
        {/* Header */}
        <View style={walletViewStyles.header}>
          <BackButton accessibilityLabel="Back to profile" onPress={onBack} />
          <Txt style={walletViewStyles.headerTitle}>Wallet</Txt>
          <View style={{ width: 24 }} />
        </View>

        {/* Current Balance Section */}
        <View style={walletViewStyles.balanceCard}>
          <View style={walletViewStyles.walletBadge}>
            <Wallet size={24} color="#10B981" strokeWidth={2} />
          </View>
          <Txt style={walletViewStyles.balanceLabel}>Current balance</Txt>
          <Txt style={walletViewStyles.balanceValue}>
            {`NGN ${balance.toLocaleString("en-US")}`}
          </Txt>
        </View>

        {/* Action Buttons: Deposit & Withdraw */}
        <View style={walletViewStyles.actionsRow}>
          <View style={walletViewStyles.actionItem}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Deposit"
              onPress={() => setTopUpOpen(true)}
              style={walletViewStyles.actionCircle}
            >
              <Plus size={24} color="#1F2937" strokeWidth={2.2} />
            </Pressable>
            <Txt style={walletViewStyles.actionLabel}>Deposit</Txt>
          </View>

        </View>

        {/* Activity Section */}
        <View style={walletViewStyles.activitySection}>
          <Txt style={walletViewStyles.activityTitle}>Activity</Txt>

          <View style={walletViewStyles.activityList}><WalletTransactionHistory /></View>
        </View>
      </ScrollView>

      {/* Deposit Bottom Sheet (PresentationSheet) */}
      {topUpOpen && (
        <TopUpSheet onClose={() => setTopUpOpen(false)} />
      )}

    </View>
  );
}

function WithdrawSheet({ onClose }: { onClose: () => void }) {
  const { snapshot } = usePassenger();
  const viewer = snapshot?.viewer;
  const banks = snapshot?.mobileConfig?.banks ?? [];
  const withdrawalPresets = snapshot?.mobileConfig?.wallet.withdrawalPresetsNaira ?? [];
  const balance = viewer?.walletBalanceNaira ?? 0;
  const bank = useQuery(api.finance.bankAccount, viewer ? {} : "skip");
  const requestWithdrawal = useMutation(api.wallet.requestWithdrawal);

  const [amount, setAmount] = useState("");
  const [selectedBankCode, setSelectedBankCode] = useState(bank?.bankCode ?? banks[0]?.code ?? "");
  const [accountNumber, setAccountNumber] = useState(bank?.last4 ? `•••• •••• ${bank.last4}` : "");
  const [accountName, setAccountName] = useState(bank?.accountName ?? "");
  const [editingBank, setEditingBank] = useState(!bank?.ready);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const numericAmount = Number(amount.replace(/[^0-9]/g, ""));
  const selectedBank = banks.find(b => b.code === selectedBankCode) ?? banks[0];
  const canWithdraw = numericAmount >= 100 && numericAmount <= balance && (bank?.ready || (accountNumber.replace(/[^0-9]/g, "").length === 10));

  const handleQuickAmount = (val: number) => {
    setAmount(String(Math.min(val, balance)));
  };

  const handleWithdraw = async () => {
    if (!canWithdraw) return;
    setBusy(true);
    setError("");
    try {
      await requestWithdrawal({
        amountNaira: numericAmount,
        bankCode: selectedBankCode,
        accountNumber: accountNumber.replace(/[^0-9]/g, ""),
        accountName: accountName.trim() || bank?.accountName,
      });
      setSuccess(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PresentationSheet title="Withdraw Funds" onClose={onClose}>
      {success ? (
        <View style={withdrawStyles.successContainer}>
          <View style={withdrawStyles.successIconCircle}>
            <Check size={28} color="#FFFFFF" strokeWidth={3} />
          </View>
          <Txt style={withdrawStyles.successTitle}>Withdrawal Requested!</Txt>
          <Txt style={withdrawStyles.successSubtitle}>
            ₦{numericAmount.toLocaleString()} will be transferred to your account (
            {accountName || bank?.accountName || "bank account"}).
          </Txt>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={withdrawStyles.greenPillButton}
          >
            <Txt style={withdrawStyles.greenPillButtonText}>Done</Txt>
          </Pressable>
        </View>
      ) : (
        <View style={withdrawStyles.container}>
          {/* Balance Preview */}
          <View style={withdrawStyles.balanceCard}>
            <Txt style={withdrawStyles.balanceLabel}>Available balance</Txt>
            <Txt style={withdrawStyles.balanceValue}>₦{balance.toLocaleString()}</Txt>
          </View>

          {/* Amount input */}
          <View style={withdrawStyles.inputGroup}>
            <Txt style={withdrawStyles.fieldLabel}>Amount to withdraw (₦)</Txt>
            <View style={withdrawStyles.amountInputShell}>
              <Txt style={withdrawStyles.currencyPrefix}>₦</Txt>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                style={withdrawStyles.amountInput}
              />
            </View>

            {/* Quick amount chips */}
            <View style={withdrawStyles.chipsRow}>
              {withdrawalPresets.map(val => (
                <Pressable
                  key={val}
                  accessibilityRole="button"
                  onPress={() => handleQuickAmount(val)}
                  style={[
                    withdrawStyles.chip,
                    numericAmount === val && withdrawStyles.chipSelected,
                  ]}
                >
                  <Txt
                    numberOfLines={1}
                    style={[
                      withdrawStyles.chipText,
                      numericAmount === val && withdrawStyles.chipTextSelected,
                    ]}
                  >
                    ₦{val.toLocaleString()}
                  </Txt>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                onPress={() => handleQuickAmount(balance)}
                style={[
                  withdrawStyles.chip,
                  numericAmount === balance && balance > 0 && withdrawStyles.chipSelected,
                ]}
              >
                <Txt
                  numberOfLines={1}
                  style={[
                    withdrawStyles.chipText,
                    numericAmount === balance && balance > 0 && withdrawStyles.chipTextSelected,
                  ]}
                >
                  All
                </Txt>
              </Pressable>
            </View>
          </View>

          {/* Destination Account */}
          <View style={withdrawStyles.inputGroup}>
            <View style={withdrawStyles.destHeaderRow}>
              <Txt style={withdrawStyles.fieldLabel}>Destination Account</Txt>
              {bank?.ready && (
                <Pressable
                  onPress={() => {
                    setEditingBank(!editingBank);
                    if (editingBank) {
                      setAccountNumber(`•••• •••• ${bank.last4}`);
                      setAccountName(bank.accountName);
                    } else {
                      setAccountNumber("");
                      setAccountName("");
                    }
                  }}
                >
                  <Txt style={withdrawStyles.changeLink}>
                    {editingBank ? "Use saved account" : "Change"}
                  </Txt>
                </Pressable>
              )}
            </View>

            {bank?.ready && !editingBank ? (
              <View style={withdrawStyles.savedBankCard}>
                <View style={withdrawStyles.savedBankIconCircle}>
                  <Wallet size={18} color="#168B61" strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt style={withdrawStyles.savedBankName}>
                    {selectedBank.name} •••• {bank.last4}
                  </Txt>
                  <Txt style={withdrawStyles.savedAccountHolder}>{bank.accountName}</Txt>
                </View>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {/* Bank picker */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setBankPickerOpen(!bankPickerOpen)}
                  style={withdrawStyles.dropdownButton}
                >
                  <Txt style={withdrawStyles.dropdownText}>{selectedBank.name}</Txt>
                  <ChevronDown size={18} color="#6B7280" strokeWidth={2} />
                </Pressable>

                {bankPickerOpen && (
                  <View style={withdrawStyles.dropdownMenu}>
                    <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                      {banks.map(b => (
                        <Pressable
                          key={b.code}
                          onPress={() => {
                            setSelectedBankCode(b.code);
                            setBankPickerOpen(false);
                          }}
                          style={[
                            withdrawStyles.dropdownItem,
                            b.code === selectedBankCode && withdrawStyles.dropdownItemSelected,
                          ]}
                        >
                          <Txt
                            style={[
                              withdrawStyles.dropdownItemText,
                              b.code === selectedBankCode && withdrawStyles.dropdownItemTextSelected,
                            ]}
                          >
                            {b.name}
                          </Txt>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Account Number input */}
                <TextInput
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  placeholder="10-digit Account Number"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  maxLength={10}
                  style={withdrawStyles.standardInput}
                />

                {/* Account Name input */}
                <TextInput
                  value={accountName}
                  onChangeText={setAccountName}
                  placeholder="Account Holder Name"
                  placeholderTextColor="#9CA3AF"
                  style={withdrawStyles.standardInput}
                />
              </View>
            )}
          </View>

          {/* Transfer Summary */}
          {numericAmount > 0 ? (
            <View style={withdrawStyles.summaryCard}>
              <View style={withdrawStyles.summaryRow}>
                <Txt style={withdrawStyles.summaryLabel}>Withdrawal amount</Txt>
                <Txt style={withdrawStyles.summaryValue}>₦{numericAmount.toLocaleString()}</Txt>
              </View>
              <View style={withdrawStyles.summaryRow}>
                <Txt style={withdrawStyles.summaryLabel}>Transfer fee</Txt>
                <Txt style={[withdrawStyles.summaryValue, { color: semantic.color.action.primary }]}>Free</Txt>
              </View>
              <View style={withdrawStyles.summaryDivider} />
              <View style={withdrawStyles.summaryRow}>
                <Txt style={withdrawStyles.summaryTotalLabel}>You will receive</Txt>
                <Txt style={withdrawStyles.summaryTotalValue}>₦{numericAmount.toLocaleString()}</Txt>
              </View>
            </View>
          ) : null}

          {error ? <Notice tone="error">{error}</Notice> : null}

          {/* Action buttons */}
          <Pressable
            accessibilityRole="button"
            onPress={handleWithdraw}
            disabled={!canWithdraw || busy}
            style={[
              withdrawStyles.greenPillButton,
              (!canWithdraw || busy) && withdrawStyles.buttonDisabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Txt style={withdrawStyles.greenPillButtonText}>
                {numericAmount > 0
                  ? `Withdraw ₦${numericAmount.toLocaleString()}`
                  : "Enter amount to withdraw"}
              </Txt>
            )}
          </Pressable>
        </View>
      )}
    </PresentationSheet>
  );
}

const withdrawStyles = StyleSheet.create({
  container: {
    gap: 16,
    paddingBottom: 20,
  },
  balanceCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  balanceLabel: {
    fontSize: 14,
    color: "#6B7280",
    fontFamily: fontFamily.regular,
  },
  balanceValue: {
    fontSize: 18,
    color: "#1F2937",
    fontFamily: fontFamily.semibold,
  },
  inputGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    color: "#374151",
    fontFamily: fontFamily.medium,
  },
  destHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  changeLink: {
    fontSize: 13,
    color: semantic.color.action.primary,
    fontFamily: fontFamily.medium,
  },
  amountInputShell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 56,
  },
  currencyPrefix: {
    fontSize: 22,
    color: "#1F2937",
    fontFamily: fontFamily.semibold,
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    color: "#1F2937",
    fontFamily: fontFamily.semibold,
    padding: 0,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
  },
  chipSelected: {
    backgroundColor: "#D1FAE5",
  },
  chipText: {
    fontSize: 13,
    color: "#4B5563",
    fontFamily: fontFamily.medium,
  },
  chipTextSelected: {
    color: "#168B61",
  },
  savedBankCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  savedBankIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#A8EBCF",
    alignItems: "center",
    justifyContent: "center",
  },
  savedBankName: {
    fontSize: 15,
    color: "#1F2937",
    fontFamily: fontFamily.semibold,
  },
  savedAccountHolder: {
    fontSize: 13,
    color: "#6B7280",
    fontFamily: fontFamily.regular,
    marginTop: 2,
  },
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
  },
  dropdownText: {
    fontSize: 15,
    color: "#1F2937",
    fontFamily: fontFamily.regular,
  },
  dropdownMenu: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    overflow: "hidden",
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dropdownItemSelected: {
    backgroundColor: "#D1FAE5",
  },
  dropdownItemText: {
    fontSize: 14,
    color: "#374151",
    fontFamily: fontFamily.regular,
  },
  dropdownItemTextSelected: {
    color: "#168B61",
    fontFamily: fontFamily.semibold,
  },
  standardInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
    fontSize: 15,
    color: "#1F2937",
    fontFamily: fontFamily.regular,
  },
  summaryCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontFamily: fontFamily.regular,
  },
  summaryValue: {
    fontSize: 14,
    color: "#1F2937",
    fontFamily: fontFamily.medium,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 4,
  },
  summaryTotalLabel: {
    fontSize: 14,
    color: "#1F2937",
    fontFamily: fontFamily.semibold,
  },
  summaryTotalValue: {
    fontSize: 16,
    color: "#1F2937",
    fontFamily: fontFamily.semibold,
  },
  greenPillButton: {
    backgroundColor: semantic.color.action.primary,
    borderRadius: 28,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  greenPillButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: fontFamily.semibold,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  successContainer: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 12,
  },
  successIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: semantic.color.action.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 20,
    color: "#1F2937",
    fontFamily: fontFamily.semibold,
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    fontFamily: fontFamily.regular,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 12,
  },
});

// -------------------------------------------------------------
// Modal: Delete Account Confirmation
// -------------------------------------------------------------
function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const data = usePassenger();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requested, setRequested] = useState(false);
  const submit = async () => {
    setBusy(true); setError("");
    try { await data.requestAccountDeletion(); setRequested(true); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  return (
    <PresentationSheet title="Delete Account" onClose={() => !busy && onClose()}>
      <View style={{ gap: 14, paddingBottom: 16 }}>
        {requested ? <Notice tone="success">Your deletion request has been recorded. Passenger operations can now complete the required data and payment checks.</Notice> : <Txt style={p.confirmDetail}>
          Are you sure you want to delete your Passenger account? If you have active deliveries,
          unsettled payments, or held funds, you must complete or cancel them before your account can be deleted.
        </Txt>}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <View style={{ gap: 10, marginTop: 12 }}>
          <Button
            title={requested ? "Done" : "Request account deletion"}
            variant={requested ? "primary" : "danger"}
            busy={busy}
            disabled={busy || data.offline}
            onPress={requested ? onClose : () => void submit()}
          />
        </View>
      </View>
    </PresentationSheet>
  );
}

// -------------------------------------------------------------
// Modal: Logout Confirmation
// -------------------------------------------------------------
function LogoutModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <PresentationSheet title="Sign out" onClose={onClose}>
      <View style={{ gap: 14, paddingBottom: 16 }}>
        <Txt style={p.confirmDetail}>
          Are you sure you want to sign out of your Passenger account?
        </Txt>
        <View style={{ gap: 10, marginTop: 12 }}>
          <Button
            title="Sign out securely"
            variant="primary"
            onPress={onConfirm}
          />
        </View>
      </View>
    </PresentationSheet>
  );
}

// -------------------------------------------------------------
// Styles matching the design mockups
// -------------------------------------------------------------
const p = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F9F9FB",
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  mainTitle: {
    fontSize: 24,
    fontFamily: fontFamily.semibold,
    color: "#111827",
    marginBottom: 20,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  userName: {
    fontSize: 18,
    fontFamily: fontFamily.semibold,
    color: "#111827",
  },
  userSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 20,
  },
  menuList: {
    gap: 4,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  menuLabel: {
    fontSize: 16,
    fontFamily: fontFamily.medium,
    color: "#1F2937",
  },
  tierBadge: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  tierBadgeVerified: {
    backgroundColor: "#E0E7FF",
  },
  tierBadgeText: {
    color: "#10B981",
    fontSize: 13,
    fontFamily: fontFamily.semibold,
  },
  tierBadgeTextVerified: {
    color: "#4F46E5",
  },
  headerNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerNavSimple: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  screenHeaderTitle: {
    fontSize: 18,
    fontFamily: fontFamily.semibold,
    color: "#111827",
  },
  toastPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: semantic.color.action.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 8,
    alignSelf: "center",
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: fontFamily.semibold,
  },
  avatarCentered: {
    alignItems: "center",
    marginVertical: 20,
  },
  avatarWrap: {
    position: "relative",
  },
  editAvatarBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: semantic.color.action.primary,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  personalName: {
    fontSize: 18,
    fontFamily: fontFamily.semibold,
    color: "#111827",
    marginTop: 14,
  },
  personalPhone: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  formSection: {
    marginTop: 24,
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
    color: "#374151",
    marginBottom: 8,
  },
  sectionHeading: {
    fontSize: 16,
    fontFamily: fontFamily.semibold,
    color: "#111827",
    marginBottom: 14,
  },
  inputBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#111827",
  },
  inputBoxActive: {
    borderColor: semantic.color.action.primary,
  },
  greenButtonSmall: {
    backgroundColor: semantic.color.action.primary,
    borderRadius: 22,
    height: 44,
    width: 120,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  greenButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: fontFamily.semibold,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  passwordRowText: {
    fontSize: 15,
    fontFamily: fontFamily.medium,
    color: "#1F2937",
  },
  thinDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#F9F9FB",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  modalCancelText: {
    fontSize: 15,
    color: "#4B5563",
    fontFamily: fontFamily.medium,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: fontFamily.semibold,
    color: "#111827",
  },
  modalBody: {
    padding: 20,
  },
  modalLabel: {
    fontSize: 15,
    fontFamily: fontFamily.medium,
    color: "#374151",
    marginTop: 10,
  },
  otpDescription: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 20,
    marginTop: 10,
  },
  otpContainer: {
    position: "relative",
    marginVertical: 16,
  },
  hiddenInput: {
    position: "absolute",
    width: "100%",
    height: "100%",
    opacity: 0,
    zIndex: 1,
  },
  otpBoxesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  otpBox: {
    flex: 1,
    height: 52,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxFocused: {
    borderColor: semantic.color.action.primary,
    borderWidth: 2,
  },
  otpBoxFilled: {
    borderColor: "#111827",
  },
  otpDigit: {
    fontSize: 20,
    fontFamily: fontFamily.semibold,
    color: "#111827",
  },
  resendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  timerText: {
    fontSize: 14,
    color: "#374151",
    fontFamily: fontFamily.medium,
  },
  resendButtonText: {
    fontSize: 14,
    fontFamily: fontFamily.semibold,
    color: "#111827",
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  greenButtonFull: {
    backgroundColor: semantic.color.action.primary,
    borderRadius: 25,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  greenButtonFullText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: fontFamily.semibold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  confirmCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  confirmTitle: {
    fontSize: 18,
    fontFamily: fontFamily.semibold,
    color: "#111827",
    marginBottom: 10,
  },
  confirmDetail: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 20,
  },
  tierOverviewCard: {
    backgroundColor: "#F0FDF4",
    borderColor: "#DCFCE7",
    borderWidth: 1,
    marginBottom: 20,
  },
  tierCardLabel: {
    fontSize: 10,
    fontFamily: fontFamily.medium,
    letterSpacing: 1.2,
    color: "#15803D",
  },
  tierCardTitle: {
    fontSize: 22,
    fontFamily: fontFamily.semibold,
    color: "#166534",
    marginTop: 2,
  },
  tierBadgeLarge: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
});

const tierStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9F9FB",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 110,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    marginTop: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: fontFamily.semibold,
    color: "#1F2937",
  },
  toastBanner: {
    backgroundColor: semantic.color.action.primary,
    borderRadius: 30,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  toastIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  toastBannerText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: fontFamily.medium,
    flex: 1,
  },
  cardsList: {
    gap: 14,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tierName: {
    fontSize: 16,
    fontFamily: fontFamily.semibold,
    color: "#1F2937",
  },
  currentBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  currentBadgeText: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
    color: "#16A34A",
  },
  nextBadge: {
    backgroundColor: "#E5E7EB",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  nextBadgeText: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
    color: "#4B5563",
  },
  cardBody: {
    marginTop: 12,
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginBottom: 12,
  },
  tierDescription: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
    fontFamily: fontFamily.regular,
  },
  bulletList: {
    gap: 6,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bulletDot: {
    fontSize: 14,
    color: "#1F2937",
    lineHeight: 20,
  },
  bulletText: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
    fontFamily: fontFamily.regular,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: "transparent",
  },
  greenPillButton: {
    backgroundColor: semantic.color.action.primary,
    borderRadius: 28,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  greenPillButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: fontFamily.semibold,
  },
  modalScreen: {
    flex: 1,
    backgroundColor: "#F9F9FB",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  modalCancelBtn: {
    width: 60,
  },
  modalCancelText: {
    fontSize: 15,
    color: "#4B5563",
    fontFamily: fontFamily.medium,
  },
  modalHeaderTitle: {
    fontSize: 17,
    fontFamily: fontFamily.semibold,
    color: "#1F2937",
    textAlign: "center",
  },
  modalScroll: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 100,
  },
  fieldLabel: {
    fontSize: 14,
    color: "#374151",
    fontFamily: fontFamily.medium,
    marginBottom: 6,
  },
  whiteInputBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: fontFamily.regular,
    color: "#1F2937",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  stepSubheading: {
    fontSize: 15,
    fontFamily: fontFamily.semibold,
    color: "#1F2937",
    marginBottom: 8,
  },
  dropdownSelector: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  dropdownSelectorText: {
    fontSize: 15,
    color: "#1F2937",
    fontFamily: fontFamily.regular,
  },
  pickerList: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginTop: 4,
    maxHeight: 180,
    overflow: "hidden",
  },
  pickerItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  pickerItemText: {
    fontSize: 14,
    color: "#374151",
  },
  uploadBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    height: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadInnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  uploadedFileLink: {
    fontSize: 14,
    color: "#1F2937",
    fontFamily: fontFamily.medium,
    textDecorationLine: "underline",
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  permissionOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: 16,
  },
  permissionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  permissionCloseBtn: {
    alignSelf: "flex-end",
    padding: 4,
  },
  permissionTitle: {
    fontSize: 18,
    fontFamily: fontFamily.semibold,
    color: "#1F2937",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 24,
  },
  permissionSubtitle: {
    fontSize: 14,
    fontFamily: fontFamily.regular,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 24,
  },
  permissionButtons: {
    width: "100%",
    gap: 12,
  },
  outlinePillButton: {
    borderRadius: 28,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  outlinePillButtonText: {
    color: "#1F2937",
    fontSize: 16,
    fontFamily: fontFamily.semibold,
  },
});

const walletViewStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9F9FB",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
    marginTop: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: fontFamily.semibold,
    color: "#1F2937",
  },
  balanceCard: {
    alignItems: "center",
    marginTop: 8,
  },
  walletBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  balanceLabel: {
    fontSize: 15,
    fontFamily: fontFamily.medium,
    color: "#4B5563",
    marginBottom: 6,
  },
  balanceValue: {
    fontSize: 30,
    fontFamily: fontFamily.semibold,
    color: "#111827",
    letterSpacing: -0.5,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 36,
    marginTop: 32,
    marginBottom: 36,
  },
  actionItem: {
    alignItems: "center",
  },
  actionCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
    color: "#1F2937",
  },
  activitySection: {
    marginTop: 8,
  },
  activityTitle: {
    fontSize: 18,
    fontFamily: fontFamily.semibold,
    color: "#1F2937",
    marginBottom: 16,
  },
  activityList: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  activityIconShell: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  activityLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: fontFamily.regular,
    color: "#1F2937",
    marginLeft: 14,
  },
  activityAmount: {
    fontSize: 15,
    fontFamily: fontFamily.medium,
    color: "#1F2937",
  },
  activityDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginHorizontal: 16,
  },
});
