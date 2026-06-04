import { useEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
  FlatList,
  ScrollView,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./src/firebase";

const SCHOOL_ID = "demo-school";
const PROFILE_STORAGE_KEY = "dhh_emergency_profile_v1";

const activeAlertRef = doc(
  db,
  "schools",
  SCHOOL_ID,
  "control",
  "activeAlert"
);

const statusesRef = collection(db, "schools", SCHOOL_ID, "statuses");

export default function App() {
  const [profile, setProfile] = useState(null);
  const [activeAlert, setActiveAlert] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      const savedProfile = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);

      if (savedProfile) {
        setProfile(JSON.parse(savedProfile));
      }

      setLoading(false);
    }

    loadProfile();
  }, []);

  useEffect(() => {
    const unsubscribeAlert = onSnapshot(activeAlertRef, (snapshot) => {
      if (!snapshot.exists()) {
        setActiveAlert(null);
        return;
      }

      const data = snapshot.data();
      setActiveAlert(data.active ? data : null);
    });

    return unsubscribeAlert;
  }, []);

  useEffect(() => {
    const unsubscribeStatuses = onSnapshot(statusesRef, (snapshot) => {
      const rows = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      setStudents(rows);
    });

    return unsubscribeStatuses;
  }, []);

  async function saveProfile(newProfile) {
    await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(newProfile));
    setProfile(newProfile);

    if (newProfile.role === "student") {
      await setDoc(
        doc(db, "schools", SCHOOL_ID, "statuses", newProfile.id),
        {
          id: newProfile.id,
          name: newProfile.name,
          role: "student",
          schoolCode: newProfile.schoolCode,
          classCode: newProfile.classCode,
          location: newProfile.room,
          accessibilityNeeds: newProfile.accessibilityNeeds,
          status: "NO_RESPONSE",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  async function resetProfile() {
    await AsyncStorage.removeItem(PROFILE_STORAGE_KEY);
    setProfile(null);
  }

  async function createAlert(type) {
    const alertCopy = getAlertCopy(type);
    const alertId = Date.now().toString();

    await setDoc(activeAlertRef, {
      id: alertId,
      active: true,
      type,
      title: alertCopy.title,
      mainInstruction: alertCopy.mainInstruction,
      detail: alertCopy.detail,
      route: alertCopy.route,
      createdAt: serverTimestamp(),
    });

    const snapshot = await getDocs(statusesRef);

    for (const studentDoc of snapshot.docs) {
      await setDoc(
        doc(db, "schools", SCHOOL_ID, "statuses", studentDoc.id),
        {
          status: "NO_RESPONSE",
          activeAlertId: alertId,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  async function endAlert() {
    await setDoc(
      activeAlertRef,
      {
        active: false,
        endedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const snapshot = await getDocs(statusesRef);

    for (const studentDoc of snapshot.docs) {
      await setDoc(
        doc(db, "schools", SCHOOL_ID, "statuses", studentDoc.id),
        {
          status: "NO_RESPONSE",
          activeAlertId: null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  async function updateStudentStatus(status, helpReason = null) {
    if (!profile || profile.role !== "student") return;

    await setDoc(
      doc(db, "schools", SCHOOL_ID, "statuses", profile.id),
      {
        id: profile.id,
        name: profile.name,
        role: "student",
        schoolCode: profile.schoolCode,
        classCode: profile.classCode,
        location: profile.room,
        accessibilityNeeds: profile.accessibilityNeeds,
        status,
        helpReason: status === "NEED_HELP" ? helpReason : null,
        activeAlertId: activeAlert?.id ?? null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <Text style={styles.loadingText}>Loading emergency profile...</Text>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return <SetupScreen onSaveProfile={saveProfile} />;
  }

  if (profile.role === "student") {
    const student =
      students.find((item) => item.id === profile.id) ?? {
        id: profile.id,
        name: profile.name,
        location: profile.room,
        classCode: profile.classCode,
        accessibilityNeeds: profile.accessibilityNeeds,
        status: "NO_RESPONSE",
      };

    return (
      <StudentScreen
        profile={profile}
        student={student}
        activeAlert={activeAlert}
        onSafe={() => updateStudentStatus("SAFE")}
        onNeedHelp={(reason) => updateStudentStatus("NEED_HELP", reason)}
        onResetProfile={resetProfile}
      />
    );
  }

  return (
    <DashboardScreen
      profile={profile}
      activeAlert={activeAlert}
      students={students}
      onCreateAlert={createAlert}
      onEndAlert={endAlert}
      onResetProfile={resetProfile}
    />
  );
}

function SetupScreen({ onSaveProfile }) {
  const [role, setRole] = useState("student");
  const [name, setName] = useState("");
  const [schoolCode, setSchoolCode] = useState("demo-school");
  const [room, setRoom] = useState("Room 204");
  const [classCode, setClassCode] = useState("WONG-204");
  const [accessibilityNeeds, setAccessibilityNeeds] = useState(
    "Hard of hearing"
  );

  function handleSave() {
    const id =
      role === "student" ? `student-${Date.now()}` : `${role}-${Date.now()}`;

    const newProfile = {
      id,
      role,
      name: name.trim() || (role === "student" ? "Student" : "Staff"),
      schoolCode: schoolCode.trim() || "demo-school",
      room: room.trim() || "Unknown room",
      classCode: classCode.trim() || "GENERAL",
      accessibilityNeeds:
        accessibilityNeeds.trim() || "No accessibility needs listed",
    };

    onSaveProfile(newProfile);
  }

  return (
    <SafeAreaView style={styles.setupScreen}>
      <ScrollView contentContainerStyle={styles.setupContent}>
        <Text style={styles.appTitle}>Emergency Profile Setup</Text>
        <Text style={styles.appSubtitle}>
          Set this up once during a normal school day. During an emergency, the
          app will skip setup and open directly into emergency mode.
        </Text>

        <Text style={styles.label}>Choose role</Text>

        <View style={styles.roleRow}>
          {["student", "teacher", "admin"].map((item) => (
            <Pressable
              key={item}
              style={[styles.roleButton, role === item && styles.roleSelected]}
              onPress={() => setRole(item)}
            >
              <Text style={styles.roleButtonText}>{item.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Anjay"
          placeholderTextColor="#94A3B8"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>School code</Text>
        <TextInput
          style={styles.input}
          placeholder="demo-school"
          placeholderTextColor="#94A3B8"
          value={schoolCode}
          onChangeText={setSchoolCode}
        />

        {role === "student" && (
          <>
            <Text style={styles.label}>Current/default room</Text>
            <TextInput
              style={styles.input}
              placeholder="Room 204"
              placeholderTextColor="#94A3B8"
              value={room}
              onChangeText={setRoom}
            />

            <Text style={styles.label}>Accessibility needs</Text>
            <TextInput
              style={styles.input}
              placeholder="Hard of hearing"
              placeholderTextColor="#94A3B8"
              value={accessibilityNeeds}
              onChangeText={setAccessibilityNeeds}
            />
          </>
        )}

        {(role === "student" || role === "teacher") && (
          <>
            <Text style={styles.label}>Class / teacher code</Text>
            <TextInput
              style={styles.input}
              placeholder="WONG-204"
              placeholderTextColor="#94A3B8"
              value={classCode}
              onChangeText={setClassCode}
            />

            <Text style={styles.helperText}>
              Students and teachers with the same class code are matched
              automatically.
            </Text>
          </>
        )}

        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save Emergency Profile</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function StudentScreen({
  profile,
  student,
  activeAlert,
  onSafe,
  onNeedHelp,
  onResetProfile,
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const lastAlertIdRef = useRef(null);
  const [helpReason, setHelpReason] = useState("I cannot hear instructions");

  useEffect(() => {
    if (!activeAlert) return;

    if (lastAlertIdRef.current !== activeAlert.id) {
      lastAlertIdRef.current = activeAlert.id;

      async function runAttentionSequence() {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

        setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }, 700);

        setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }, 1400);
      }

      runAttentionSequence();
    }
  }, [activeAlert]);

  useEffect(() => {
    if (!activeAlert) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => animation.stop();
  }, [activeAlert, pulseAnim]);

  if (!activeAlert) {
    return (
      <SafeAreaView style={styles.normalScreen}>
        <Text style={styles.normalTitle}>Normal School Day</Text>
        <Text style={styles.normalSubtitle}>No active emergency alert.</Text>

        <View style={styles.smallCard}>
          <Text style={styles.smallLabel}>Student</Text>
          <Text style={styles.smallValue}>{profile.name}</Text>

          <Text style={styles.smallLabel}>Location</Text>
          <Text style={styles.smallValue}>{profile.room}</Text>

          <Text style={styles.smallLabel}>Class code</Text>
          <Text style={styles.smallValue}>{profile.classCode}</Text>

          <Text style={styles.smallLabel}>Accessibility</Text>
          <Text style={styles.smallValue}>{profile.accessibilityNeeds}</Text>

          <Text style={styles.smallLabel}>Status</Text>
          <Text style={styles.smallValue}>{student.status}</Text>
        </View>

        <Pressable style={styles.resetButton} onPress={onResetProfile}>
          <Text style={styles.resetText}>Reset Demo Profile</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.emergencyScreen,
        activeAlert.type === "fire" && styles.fireBackground,
        activeAlert.type === "lockdown" && styles.lockdownBackground,
        activeAlert.type === "earthquake" && styles.earthquakeBackground,
        activeAlert.type === "drill" && styles.drillBackground,
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.emergencyScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.Text
          style={[
            styles.emergencyTitle,
            {
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          {activeAlert.title}
        </Animated.Text>

        <View style={styles.instructionCard}>
          <Text style={styles.instructionMain}>
            {activeAlert.mainInstruction}
          </Text>
          <Text style={styles.instructionDetail}>{activeAlert.detail}</Text>
        </View>

        <View style={styles.routeCard}>
          <Text style={styles.routeLabel}>Your location</Text>
          <Text style={styles.routeValue}>{profile.room}</Text>

          <Text style={styles.routeLabel}>Guidance</Text>
          <Text style={styles.routeValue}>{activeAlert.route}</Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Your status</Text>
          <Text style={styles.statusValue}>{student.status}</Text>
        </View>

        <Pressable style={styles.safeButton} onPress={onSafe}>
          <Text style={styles.bigButtonText}>I'm Safe</Text>
        </Pressable>

        <View style={styles.reasonCard}>
          <Text style={styles.reasonTitle}>
            If you need help, choose a reason:
          </Text>

          {[
            "I cannot hear instructions",
            "I cannot find the route",
            "My route is blocked",
            "I am injured",
          ].map((reason) => (
            <Pressable
              key={reason}
              style={[
                styles.reasonButton,
                helpReason === reason && styles.reasonButtonSelected,
              ]}
              onPress={() => setHelpReason(reason)}
            >
              <Text style={styles.reasonButtonText}>{reason}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={styles.helpButton}
          onPress={() => onNeedHelp(helpReason)}
        >
          <Text style={styles.bigButtonText}>I Need Help</Text>
        </Pressable>

        <Pressable style={styles.emergencyResetButton} onPress={onResetProfile}>
          <Text style={styles.emergencyResetText}>Reset Demo Profile</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function DashboardScreen({
  profile,
  activeAlert,
  students,
  onCreateAlert,
  onEndAlert,
  onResetProfile,
}) {
  const visibleStudents =
    profile.role === "teacher"
      ? students.filter((student) => student.classCode === profile.classCode)
      : students;

  return (
    <SafeAreaView style={styles.dashboardScreen}>
      <Text style={styles.dashboardTitle}>
        {profile.role === "admin" ? "Admin Command Center" : "Teacher Dashboard"}
      </Text>

      <View style={styles.smallDashboardCard}>
        <Text style={styles.smallLabel}>Profile</Text>
        <Text style={styles.smallValue}>{profile.name}</Text>

        {profile.role === "teacher" && (
          <>
            <Text style={styles.smallLabel}>Class code</Text>
            <Text style={styles.smallValue}>{profile.classCode}</Text>
          </>
        )}
      </View>

      <Text style={styles.sectionTitle}>Active Alert</Text>

      <View style={styles.activeAlertBox}>
        <Text style={styles.activeAlertText}>
          {activeAlert ? activeAlert.title : "No active alert"}
        </Text>
      </View>

      {profile.role === "admin" && (
        <View style={styles.adminPanel}>
          <Text style={styles.sectionTitle}>Create Alert</Text>

          <Pressable
            style={[styles.alertButton, styles.fireButton]}
            onPress={() => onCreateAlert("fire")}
          >
            <Text style={styles.alertButtonText}>Trigger Fire</Text>
          </Pressable>

          <Pressable
            style={[styles.alertButton, styles.lockdownButton]}
            onPress={() => onCreateAlert("lockdown")}
          >
            <Text style={styles.alertButtonText}>Trigger Lockdown</Text>
          </Pressable>

          <Pressable
            style={[styles.alertButton, styles.earthquakeButton]}
            onPress={() => onCreateAlert("earthquake")}
          >
            <Text style={styles.alertButtonText}>Trigger Earthquake</Text>
          </Pressable>

          <Pressable
            style={[styles.alertButton, styles.drillButton]}
            onPress={() => onCreateAlert("drill")}
          >
            <Text style={styles.alertButtonText}>Trigger Drill</Text>
          </Pressable>

          <Pressable style={styles.endButton} onPress={onEndAlert}>
            <Text style={styles.endButtonText}>End Alert</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.sectionTitle}>
        {profile.role === "teacher"
          ? "Matched Student Status"
          : "All Student Status"}
      </Text>

      <FlatList
        data={visibleStudents}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No matched students yet. Use the same class code on a student setup.
          </Text>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.studentRow,
              item.status === "SAFE" && styles.safeRow,
              item.status === "NEED_HELP" && styles.helpRow,
              item.status === "NO_RESPONSE" && styles.noResponseRow,
            ]}
          >
            <Text style={styles.studentName}>{item.name}</Text>
            <Text style={styles.studentDetail}>Location: {item.location}</Text>
            <Text style={styles.studentDetail}>Class code: {item.classCode}</Text>
            <Text style={styles.studentDetail}>
              Accessibility: {item.accessibilityNeeds}
            </Text>
            <Text style={styles.studentStatus}>{item.status}</Text>

            {item.status === "NEED_HELP" && item.helpReason && (
              <Text style={styles.helpReasonText}>
                Reason: {item.helpReason}
              </Text>
            )}
          </View>
        )}
      />

      <Pressable style={styles.resetButton} onPress={onResetProfile}>
        <Text style={styles.resetText}>Reset Demo Profile</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function getAlertCopy(type) {
  if (type === "fire") {
    return {
      title: "FIRE ALERT",
      mainInstruction: "EVACUATE NOW",
      detail: "Use the assigned route. Do not use elevators.",
      route: "Proceed to Exit C. Assembly point: Tennis Courts.",
    };
  }

  if (type === "lockdown") {
    return {
      title: "LOCKDOWN",
      mainInstruction: "DO NOT EVACUATE",
      detail: "Move away from doors and windows. Stay low and silent.",
      route: "Stay inside your current room. Await visual updates.",
    };
  }

  if (type === "earthquake") {
    return {
      title: "EARTHQUAKE",
      mainInstruction: "DROP, COVER, HOLD ON",
      detail: "Stay away from glass. Wait for visual instructions.",
      route: "Take cover under sturdy furniture if available.",
    };
  }

  return {
    title: "DRILL MODE",
    mainInstruction: "THIS IS A DRILL",
    detail: "Practice the emergency response calmly.",
    route: "Follow your school-approved drill route.",
  };
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    color: "white",
    fontSize: 22,
    fontWeight: "800",
  },
  setupScreen: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  setupContent: {
    padding: 24,
    paddingTop: 60,
  },
  appTitle: {
    color: "white",
    fontSize: 34,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 12,
  },
  appSubtitle: {
    color: "#CBD5E1",
    fontSize: 17,
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 24,
  },
  label: {
    color: "white",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 8,
    marginTop: 12,
  },
  helperText: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#1E293B",
    color: "white",
    padding: 16,
    borderRadius: 14,
    fontSize: 18,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#334155",
  },
  roleRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  roleButton: {
    flex: 1,
    backgroundColor: "#334155",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  roleSelected: {
    backgroundColor: "#2563EB",
  },
  roleButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "900",
  },
  saveButton: {
    backgroundColor: "#16A34A",
    padding: 18,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 40,
  },
  saveButtonText: {
    color: "white",
    fontSize: 20,
    fontWeight: "900",
  },
  normalScreen: {
    flex: 1,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  normalTitle: {
    color: "white",
    fontSize: 34,
    fontWeight: "900",
    marginBottom: 10,
  },
  normalSubtitle: {
    color: "#CBD5E1",
    fontSize: 20,
    marginBottom: 24,
  },
  smallCard: {
    backgroundColor: "#1E293B",
    padding: 20,
    borderRadius: 18,
    width: "100%",
    marginBottom: 20,
  },
  smallDashboardCard: {
    backgroundColor: "#1E293B",
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
  },
  smallLabel: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 8,
  },
  smallValue: {
    color: "white",
    fontSize: 22,
    fontWeight: "900",
  },
  emergencyScreen: {
    flex: 1,
  },
  emergencyScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 22,
    paddingTop: 50,
    paddingBottom: 40,
  },
  fireBackground: {
    backgroundColor: "#7F1D1D",
  },
  lockdownBackground: {
    backgroundColor: "#78350F",
  },
  earthquakeBackground: {
    backgroundColor: "#1E3A8A",
  },
  drillBackground: {
    backgroundColor: "#1E293B",
  },
  emergencyTitle: {
    color: "white",
    fontSize: 46,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 18,
  },
  instructionCard: {
    backgroundColor: "white",
    padding: 22,
    borderRadius: 22,
    marginBottom: 16,
  },
  instructionMain: {
    color: "#020617",
    fontSize: 30,
    fontWeight: "900",
    marginBottom: 10,
  },
  instructionDetail: {
    color: "#334155",
    fontSize: 20,
    lineHeight: 28,
  },
  routeCard: {
    backgroundColor: "rgba(255,255,255,0.15)",
    padding: 18,
    borderRadius: 18,
    marginBottom: 16,
  },
  routeLabel: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 6,
  },
  routeValue: {
    color: "white",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 6,
  },
  statusCard: {
    backgroundColor: "rgba(255,255,255,0.18)",
    padding: 16,
    borderRadius: 18,
    marginBottom: 16,
  },
  statusLabel: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "900",
  },
  statusValue: {
    color: "white",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 4,
  },
  safeButton: {
    backgroundColor: "#16A34A",
    padding: 22,
    borderRadius: 20,
    alignItems: "center",
    marginBottom: 14,
  },
  helpButton: {
    backgroundColor: "#DC2626",
    padding: 22,
    borderRadius: 20,
    alignItems: "center",
  },
  bigButtonText: {
    color: "white",
    fontSize: 26,
    fontWeight: "900",
  },
  emergencyResetButton: {
    marginTop: 18,
    alignSelf: "center",
    padding: 12,
  },
  emergencyResetText: {
    color: "white",
    fontSize: 16,
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  dashboardScreen: {
    flex: 1,
    backgroundColor: "#0F172A",
    padding: 20,
  },
  dashboardTitle: {
    color: "white",
    fontSize: 30,
    fontWeight: "900",
    marginBottom: 16,
  },
  sectionTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 12,
    marginBottom: 10,
  },
  activeAlertBox: {
    backgroundColor: "#1E293B",
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
  },
  activeAlertText: {
    color: "white",
    fontSize: 20,
    fontWeight: "800",
  },
  adminPanel: {
    backgroundColor: "#111827",
    padding: 16,
    borderRadius: 18,
    marginBottom: 12,
  },
  alertButton: {
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  fireButton: {
    backgroundColor: "#DC2626",
  },
  lockdownButton: {
    backgroundColor: "#D97706",
  },
  earthquakeButton: {
    backgroundColor: "#2563EB",
  },
  drillButton: {
    backgroundColor: "#475569",
  },
  alertButtonText: {
    color: "white",
    fontSize: 17,
    fontWeight: "900",
  },
  endButton: {
    backgroundColor: "white",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  endButtonText: {
    color: "#020617",
    fontSize: 17,
    fontWeight: "900",
  },
  studentRow: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
  },
  safeRow: {
    backgroundColor: "#14532D",
  },
  helpRow: {
    backgroundColor: "#7F1D1D",
  },
  noResponseRow: {
    backgroundColor: "#334155",
  },
  studentName: {
    color: "white",
    fontSize: 18,
    fontWeight: "900",
  },
  studentDetail: {
    color: "#CBD5E1",
    fontSize: 15,
    marginTop: 4,
  },
  studentStatus: {
    color: "white",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 6,
  },
  emptyText: {
    color: "#CBD5E1",
    fontSize: 16,
    lineHeight: 22,
    marginTop: 10,
  },
  resetButton: {
    marginTop: 18,
    alignSelf: "center",
    padding: 12,
  },
  resetText: {
    color: "#CBD5E1",
    fontSize: 16,
    textDecorationLine: "underline",
  },
  reasonCard: {
    backgroundColor: "rgba(255,255,255,0.15)",
    padding: 14,
    borderRadius: 16,
    marginBottom: 14,
  },
  reasonTitle: {
    color: "white",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 8,
  },
  reasonButton: {
    backgroundColor: "rgba(255,255,255,0.18)",
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
  },
  reasonButtonSelected: {
    backgroundColor: "#2563EB",
  },
  reasonButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "800",
  },
  helpReasonText: {
    color: "#FECACA",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 6,
  },
});