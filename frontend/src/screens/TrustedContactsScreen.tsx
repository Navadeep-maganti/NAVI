import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { apiClient } from "../config/api";
import { colors } from "../theme/colors";

interface TrustedContact {
  _id: string;
  name: string;
  phone: string;
  email: string;
  relationship: string;
  notifyOnEmergency: boolean;
  canViewLiveLocation: boolean;
  isVerified: boolean;
}

export const TrustedContactsScreen: React.FC = () => {
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [saving, setSaving] = useState(false);

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);

  const fetchContacts = async () => {
    try {
      const { data } = await apiClient.get("/api/contacts");
      setContacts(data.contacts || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setPhone("");
    setEmail("");
    setRelationship("");
    setShowForm(false);
  };

  const handleOpenEdit = (contact: TrustedContact) => {
    setEditingId(contact._id);
    setName(contact.name);
    setPhone(contact.phone);
    setEmail(contact.email || "");
    setRelationship(contact.relationship || "");
    setShowForm(true);
  };

  const handleSaveContact = async () => {
    if (!name.trim() || !phone.trim()) {
      Alert.alert("Missing Fields", "Name and phone number are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        relationship: relationship.trim(),
      };
      if (editingId) {
        await apiClient.put(`/api/contacts/${editingId}`, payload);
      } else {
        await apiClient.post("/api/contacts", payload);
      }
      resetForm();
      await fetchContacts();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Could not save contact.";
      Alert.alert("Error", msg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleField = async (
    contact: TrustedContact,
    field: "notifyOnEmergency" | "canViewLiveLocation",
    value: boolean
  ) => {
    setContacts((prev) =>
      prev.map((c) => (c._id === contact._id ? { ...c, [field]: value } : c))
    );
    try {
      await apiClient.put(`/api/contacts/${contact._id}`, { [field]: value });
    } catch {
      await fetchContacts();
    }
  };

  const handleDelete = (contact: TrustedContact) => {
    Alert.alert("Remove Contact?", `Remove ${contact.name} from trusted contacts?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await apiClient.delete(`/api/contacts/${contact._id}`);
          await fetchContacts();
        },
      },
    ]);
  };

  const handleRequestVerify = async (contact: TrustedContact) => {
    try {
      const { data } = await apiClient.post(`/api/contacts/${contact._id}/request-verification`);
      setVerifyingId(contact._id);
      setOtpCode("");
      setVerifyNotice(
        data.devCode
          ? `Dev code for ${contact.name}: ${data.devCode}`
          : data.message
      );
    } catch {
      Alert.alert("Error", "Could not start contact verification.");
    }
  };

  const handleSubmitOtp = async (contactId: string) => {
    if (!otpCode.trim()) return;
    try {
      await apiClient.post(`/api/contacts/${contactId}/verify`, { code: otpCode.trim() });
      setVerifyingId(null);
      setOtpCode("");
      setVerifyNotice(null);
      await fetchContacts();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Invalid verification code.";
      Alert.alert("Verification Failed", msg);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.heading}>Trusted Contacts</Text>
          <Text style={styles.sub}>Manage who gets alerted and who can view live location</Text>
        </View>
        <TouchableOpacity
          style={styles.addPill}
          onPress={() => (showForm ? resetForm() : setShowForm(true))}
        >
          <Text style={styles.addPillText}>{showForm ? "Close" : "+ Add"}</Text>
        </TouchableOpacity>
      </View>

      {verifyNotice && (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{verifyNotice}</Text>
        </View>
      )}

      {showForm && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            {editingId ? "Edit Trusted Contact" : "New Trusted Contact"}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Full Name *"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone Number *"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <TextInput
            style={styles.input}
            placeholder="Email (for emergency alerts & verification)"
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Relationship (e.g. Parent, Partner)"
            placeholderTextColor={colors.muted}
            value={relationship}
            onChangeText={setRelationship}
          />
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveContact} disabled={saving}>
            {saving ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.saveBtnText}>
                {editingId ? "Update Contact" : "Save Contact"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
      ) : contacts.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.meta}>No trusted contacts added yet. Tap + Add above.</Text>
        </View>
      ) : (
        contacts.map((c) => (
          <View key={c._id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactName}>
                  {c.name} {c.relationship ? `(${c.relationship})` : ""}
                </Text>
                <Text style={styles.meta}>{c.phone}{c.email ? ` • ${c.email}` : ""}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: c.isVerified ? colors.success : colors.border }]}>
                <Text style={[styles.badgeText, { color: c.isVerified ? "#0B1220" : colors.text }]}>
                  {c.isVerified ? "VERIFIED" : "UNVERIFIED"}
                </Text>
              </View>
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Emergency Notifications</Text>
              <Switch
                value={c.notifyOnEmergency}
                onValueChange={(val) => handleToggleField(c, "notifyOnEmergency", val)}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Allow Live Location Sharing</Text>
              <Switch
                value={c.canViewLiveLocation !== false}
                onValueChange={(val) => handleToggleField(c, "canViewLiveLocation", val)}
              />
            </View>

            {verifyingId === c._id && (
              <View style={styles.otpRow}>
                <TextInput
                  style={styles.otpInput}
                  placeholder="6-digit code"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  value={otpCode}
                  onChangeText={setOtpCode}
                />
                <TouchableOpacity style={styles.otpBtn} onPress={() => handleSubmitOtp(c._id)}>
                  <Text style={styles.otpBtnText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.actionsRow}>
              <TouchableOpacity onPress={() => handleOpenEdit(c)}>
                <Text style={styles.verifyLink}>Edit</Text>
              </TouchableOpacity>
              {!c.isVerified && (
                <TouchableOpacity onPress={() => handleRequestVerify(c)} style={{ marginLeft: 16 }}>
                  <Text style={styles.verifyLink}>Verify Contact</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={{ marginLeft: "auto" }} onPress={() => handleDelete(c)}>
                <Text style={styles.removeLink}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 52, paddingBottom: 36 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  heading: { fontSize: 22, fontWeight: "800", color: colors.text },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  addPill: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  addPillText: { color: colors.bg, fontWeight: "800", fontSize: 13 },
  noticeBox: {
    backgroundColor: "#172554",
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  noticeText: { color: "#BAE6FD", fontSize: 13 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    marginBottom: 10,
  },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 13, borderRadius: 10, alignItems: "center" },
  saveBtnText: { color: colors.bg, fontSize: 15, fontWeight: "700" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  contactName: { color: colors.text, fontSize: 16, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  switchLabel: { color: colors.text, fontSize: 13 },
  otpRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  otpInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    color: colors.text,
  },
  otpBtn: { backgroundColor: colors.success, borderRadius: 8, paddingHorizontal: 14, justifyContent: "center" },
  otpBtnText: { color: "#0B1220", fontWeight: "700", fontSize: 13 },
  actionsRow: { flexDirection: "row", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  verifyLink: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  removeLink: { color: colors.danger, fontSize: 13, fontWeight: "700" },
});
