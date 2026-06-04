import { useEffect, useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
  FlatList,
} from "react-native";
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

const initialStudents = [
  {
    id: "student-1",
    name: "Anjay",
    email: "anjay@student.com",
    location: "Room 204",
    status: "NO_RESPONSE",
  },
  {
    id: "student-2",
    name: "Maya",
    email: "maya@student.com",
    location: "Library",
    status: "NO_RESPONSE",
  },
];

const activeAlertRef = doc(
  db,
  "schools",
  SCHOOL_ID,
  "control",
  "activeAlert"
);

const statusesRef = collection(db, "schools", SCHOOL_ID, "statuses");

export default function App() {
  const [role, setRole] = useState(null);
  const [name, setName] = useState("");
  const [activeAlert, setActiveAlert] = useState(null);
  const [students, setStudents] = useState(initialStudents);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function seedStudentsIfNeeded() {
      const snapshot = await getDocs(statusesRef);

      if (snapshot.empty) {
        for (const student of initialStudents) {
          await setDoc(
            doc(db, "schools", SCHOOL_ID, "statuses", student.id),
            {
              ...student,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      }
    }

    seedStudentsIfNeeded();
  }, []);

  useEffect(() => {
    const unsubscribeAlert = onSnapshot(activeAlertRef, (snapshot) => {
      if (!snapshot.exists()) {
        setActiveAlert(null);
        setLoading(false);
        return;
      }

      const data = snapshot.data();
      setActiveAlert(data.active ? data : null);
      setLoading(false);
    });

    return unsubscribeAlert;
  }, []);

  useEffect(() => {
    const unsubscribeStatuses = onSnapshot(statusesRef, (snapshot) => {
      const rows = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      if (rows.length > 0) {
        setStudents(rows);
      }
    });

    return unsubscribeStatuses;
  }, []);

  function loginAs(selectedRole) {
    setRole(selectedRole);
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

    for (const student of initialStudents) {
      await setDoc(
        doc(db, "schools", SCHOOL_ID, "statuses", student.id),
        {
          ...student,
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

    for (const student of initialStudents) {
      await setDoc(
        doc(db, "schools", SCHOOL_ID, "statuses", student.id),
        {
          status: "NO_RESPONSE",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  async function updateStudentStatus(status) {
    await setDoc(
      doc(db, "schools", SCHOOL_ID, "statuses", "student-1"),
      {
        id: "student-1",
        name: "Anjay",
        email: "anjay@student.com",
        location: "Room 204",
        status,
        activeAlertId: activeAlert?.id ?? null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  function logout() {
    setRole(null);
    setName("");
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <Text style={styles.loadingText}>Connecting to Firebase...</Text>
      </SafeAreaView>
    );
  }

  if (!role) {
    return (
      <SafeAreaView style={styles.loginScreen}>
        <Text style={styles.appTitle}>DHH Emergency Access</Text>
        <Text style={styles.appSubtitle}>
          Visual emergency guidance for hard-of-hearing students.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Name"
          placeholderTextColor="#94A3B8"
          value={name}
          onChangeText={setName}
        />

        <Pressable style={styles.loginButton} onPress={() => loginAs("student")}>
          <Text style={styles.loginButtonText}>Login as Student</Text>
        </Pressable>

        <Pressable style={styles.loginButton} onPress={() => loginAs("teacher")}>
          <Text style={styles.loginButtonText}>Login as Teacher</Text>
        </Pressable>

        <Pressable style={styles.adminButton} onPress={() => loginAs("admin")}>
          <Text style={styles.loginButtonText}>Login as Admin</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (role === "student") {
    const student = students.find((item) => item.id === "student-1") ?? initialStudents[0];

    return (
      <StudentScreen
        activeAlert={activeAlert}
        student={student}
        onSafe={() => updateStudentStatus("SAFE")}
        onNeedHelp={() => updateStudentStatus("NEED_HELP")}
        onLogout={logout}
      />
    );
  }

  return (
    <DashboardScreen
      role={role}
      activeAlert={activeAlert}
      students={students}
      onCreateAlert={createAlert}
      onEndAlert={endAlert}
      onLogout={logout}
    />
  );
}

function StudentScreen({
  activeAlert,
  student,
  onSafe,
  onNeedHelp,
  onLogout,
}) {
  if (!activeAlert) {
    return (
      <SafeAreaView style={styles.normalScreen}>
        <Text style={styles.normalTitle}>Normal School Day</Text>
        <Text style={styles.normalSubtitle}>No active emergency alert.</Text>

        <View style={styles.smallCard}>
          <Text style={styles.smallLabel}>Student</Text>
          <Text style={styles.smallValue}>{student.name}</Text>
          <Text style={styles.smallLabel}>Location</Text>
          <Text style={styles.smallValue}>{student.location}</Text>
          <Text style={styles.smallLabel}>Status</Text>
          <Text style={styles.smallValue}>{student.status}</Text>
        </View>

        <Pressable style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutText}>Logout / Switch Role</Text>
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
      <Text style={styles.emergencyTitle}>{activeAlert.title}</Text>

      <View style={styles.instructionCard}>
        <Text style={styles.instructionMain}>
          {activeAlert.mainInstruction}
        </Text>
        <Text style={styles.instructionDetail}>{activeAlert.detail}</Text>
      </View>

      <View style={styles.routeCard}>
        <Text style={styles.routeLabel}>Your location</Text>
        <Text style={styles.routeValue}>{student.location}</Text>

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

      <Pressable style={styles.helpButton} onPress={onNeedHelp}>
        <Text style={styles.bigButtonText}>I Need Help</Text>
      </Pressable>

      <Pressable style={styles.emergencyLogoutButton} onPress={onLogout}>
        <Text style={styles.emergencyLogoutText}>Logout / Switch Role</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function DashboardScreen({
  role,
  activeAlert,
  students,
  onCreateAlert,
  onEndAlert,
  onLogout,
}) {
  return (
    <SafeAreaView style={styles.dashboardScreen}>
      <Text style={styles.dashboardTitle}>
        {role === "admin" ? "Admin Command Center" : "Teacher Dashboard"}
      </Text>

      <Text style={styles.sectionTitle}>Active Alert</Text>

      <View style={styles.activeAlertBox}>
        <Text style={styles.activeAlertText}>
          {activeAlert ? activeAlert.title : "No active alert"}
        </Text>
      </View>

      {role === "admin" && (
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

      <Text style={styles.sectionTitle}>Live Student Status</Text>

      <FlatList
        data={students}
        keyExtractor={(item) => item.id}
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
            <Text style={styles.studentDetail}>{item.location}</Text>
            <Text style={styles.studentStatus}>{item.status}</Text>
          </View>
        )}
      />

      <Pressable style={styles.logoutButton} onPress={onLogout}>
        <Text style={styles.logoutText}>Logout / Switch Role</Text>
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
  loginScreen: {
    flex: 1,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    padding: 24,
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
  },
  input: {
    backgroundColor: "#1E293B",
    color: "white",
    padding: 16,
    borderRadius: 14,
    fontSize: 18,
    marginBottom: 16,
  },
  loginButton: {
    backgroundColor: "#2563EB",
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  adminButton: {
    backgroundColor: "#7C3AED",
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  loginButtonText: {
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
    padding: 22,
    justifyContent: "center",
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
  emergencyLogoutButton: {
    marginTop: 18,
    alignSelf: "center",
    padding: 12,
  },
  emergencyLogoutText: {
    color: "white",
    fontSize: 16,
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  bigButtonText: {
    color: "white",
    fontSize: 26,
    fontWeight: "900",
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
  logoutButton: {
    marginTop: 18,
    alignSelf: "center",
    padding: 12,
  },
  logoutText: {
    color: "#CBD5E1",
    fontSize: 16,
    textDecorationLine: "underline",
  },
});