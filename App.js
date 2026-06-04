import { useEffect, useMemo, useRef, useState } from "react";
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
  Image,
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
const PROFILE_STORAGE_KEY = "dhh_emergency_profile_v2";

const HHS_MAP = require("./assets/hhs-map.png");

const MAP_LOCATIONS = [
  { key: "Building A", label: "Building A", x: 56, y: 69 },
  { key: "Building B", label: "Building B", x: 43, y: 84 },
  { key: "Building C", label: "Building C", x: 75, y: 42 },
  { key: "Building E", label: "Building E", x: 79, y: 82 },
  { key: "Building H", label: "Building H", x: 33, y: 55 },
  { key: "Building L", label: "Building L", x: 83, y: 38 },
  { key: "Building S", label: "Building S", x: 83, y: 24 },
  { key: "Library", label: "Library", x: 54, y: 88 },
  { key: "Field House", label: "Field House", x: 8, y: 55 },
  { key: "Pool", label: "Pool", x: 25, y: 43 },
  { key: "Cafeteria", label: "Cafeteria", x: 57, y: 26 },
  { key: "Quad", label: "Quad", x: 52, y: 48 },
  { key: "Mustang Field", label: "Mustang Field", x: 8, y: 30 },
  { key: "Athletic Fields", label: "Athletic Fields", x: 52, y: 9 },
  { key: "Parking Lot", label: "Parking Lot", x: 94, y: 48 },
];

const DANGER_ZONE_OPTIONS = [
  "Building A",
  "Building B",
  "Building C",
  "Building E",
  "Building H",
  "Building L",
  "Building S",
  "Library",
  "Cafeteria",
  "Pool",
  "Quad",
  "Field House",
  "Parking Lot",
];

const ROUTE_OPTIONS = [
  "Proceed north to Athletic Fields Assembly Area",
  "Use east-side exit toward Parking Lot",
  "Use west-side route toward Field House",
  "Move to Quad, then proceed north",
  "Shelter in place in nearest safe room",
];

const activeAlertRef = doc(
  db,
  "schools",
  SCHOOL_ID,
  "control",
  "activeAlert"
);

const statusesRef = collection(db, "schools", SCHOOL_ID, "statuses");

function getReadableTime() {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getLocationByKey(key) {
  return MAP_LOCATIONS.find((item) => item.key === key);
}

function computeRoutePoints(startKey, routeOverride) {
  const start = getLocationByKey(startKey) || getLocationByKey("Quad");
  const athletic = getLocationByKey("Athletic Fields");
  const parking = getLocationByKey("Parking Lot");
  const fieldHouse = getLocationByKey("Field House");
  const quad = getLocationByKey("Quad");

  if (!routeOverride) {
    return [start, quad, athletic].filter(Boolean);
  }

  const text = routeOverride.toLowerCase();

  if (text.includes("parking")) {
    return [start, getLocationByKey("Building L"), parking].filter(Boolean);
  }

  if (text.includes("field house") || text.includes("west")) {
    return [start, getLocationByKey("Building H"), fieldHouse].filter(Boolean);
  }

  if (text.includes("shelter")) {
    return [start];
  }

  if (text.includes("quad")) {
    return [start, quad, athletic].filter(Boolean);
  }

  return [start, quad, athletic].filter(Boolean);
}

function buildRouteSegments(points) {
  const segments = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    segments.push({
      from: points[i],
      to: points[i + 1],
    });
  }
  return segments;
}

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
          room: newProfile.room,
          campusLocation: newProfile.campusLocation,
          accessibilityNeeds: newProfile.accessibilityNeeds,
          status: "NO_RESPONSE",
          helpReason: null,
          updatedAt: serverTimestamp(),
          updatedAtText: getReadableTime(),
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
    const updatedAtText = getReadableTime();

    await setDoc(activeAlertRef, {
      id: alertId,
      active: true,
      type,
      title: alertCopy.title,
      mainInstruction: alertCopy.mainInstruction,
      detail: alertCopy.detail,
      route: alertCopy.route,
      routeOverride: "Proceed north to Athletic Fields Assembly Area",
      dangerZones: [],
      latestUpdate: "Initial emergency alert issued.",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedAtText,
    });

    const snapshot = await getDocs(statusesRef);

    for (const studentDoc of snapshot.docs) {
      await setDoc(
        doc(db, "schools", SCHOOL_ID, "statuses", studentDoc.id),
        {
          status: "NO_RESPONSE",
          helpReason: null,
          activeAlertId: alertId,
          updatedAt: serverTimestamp(),
          updatedAtText,
        },
        { merge: true }
      );
    }
  }

  async function sendAlertUpdate(updateText, dangerZones, routeOverride) {
    if (!activeAlert) return;

    const cleanUpdate =
      updateText.trim() ||
      "Continue following the current emergency instructions.";

    await setDoc(
      activeAlertRef,
      {
        latestUpdate: cleanUpdate,
        dangerZones,
        routeOverride: routeOverride.trim(),
        updatedAt: serverTimestamp(),
        updatedAtText: getReadableTime(),
      },
      { merge: true }
    );
  }

  async function endAlert() {
    await setDoc(
      activeAlertRef,
      {
        active: false,
        latestUpdate: "Emergency alert ended.",
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedAtText: getReadableTime(),
      },
      { merge: true }
    );

    const snapshot = await getDocs(statusesRef);

    for (const studentDoc of snapshot.docs) {
      await setDoc(
        doc(db, "schools", SCHOOL_ID, "statuses", studentDoc.id),
        {
          status: "NO_RESPONSE",
          helpReason: null,
          activeAlertId: null,
          updatedAt: serverTimestamp(),
          updatedAtText: getReadableTime(),
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
        room: profile.room,
        campusLocation: profile.campusLocation,
        accessibilityNeeds: profile.accessibilityNeeds,
        status,
        helpReason: status === "NEED_HELP" ? helpReason : null,
        activeAlertId: activeAlert?.id ?? null,
        updatedAt: serverTimestamp(),
        updatedAtText: getReadableTime(),
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
        room: profile.room,
        campusLocation: profile.campusLocation,
        classCode: profile.classCode,
        accessibilityNeeds: profile.accessibilityNeeds,
        status: "NO_RESPONSE",
        updatedAtText: "Not updated yet",
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
      onSendAlertUpdate={sendAlertUpdate}
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
  const [campusLocation, setCampusLocation] = useState("Building L");
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
      campusLocation,
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
          app opens directly into emergency mode.
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
            <Text style={styles.label}>Room / class room</Text>
            <TextInput
              style={styles.input}
              placeholder="Room 204"
              placeholderTextColor="#94A3B8"
              value={room}
              onChangeText={setRoom}
            />

            <Text style={styles.label}>Current campus location</Text>
            <HorizontalChoiceList
              items={MAP_LOCATIONS.map((item) => item.key)}
              selected={campusLocation}
              onSelect={setCampusLocation}
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

          <Text style={styles.smallLabel}>Room</Text>
          <Text style={styles.smallValue}>{profile.room}</Text>

          <Text style={styles.smallLabel}>Campus location</Text>
          <Text style={styles.smallValue}>{profile.campusLocation}</Text>

          <Text style={styles.smallLabel}>Class code</Text>
          <Text style={styles.smallValue}>{profile.classCode}</Text>

          <Text style={styles.smallLabel}>Accessibility</Text>
          <Text style={styles.smallValue}>{profile.accessibilityNeeds}</Text>

          <Text style={styles.smallLabel}>Status</Text>
          <Text style={styles.smallValue}>{student.status}</Text>
        </View>

        <CampusMapCard
          title="Your Default Campus Position"
          currentLocation={profile.campusLocation}
          dangerZones={[]}
          routeOverride=""
        />

        <Pressable style={styles.resetButton} onPress={onResetProfile}>
          <Text style={styles.resetText}>Reset Demo Profile</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const dangerZones = activeAlert.dangerZones || [];
  const displayedRoute = activeAlert.routeOverride || activeAlert.route;

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

        <View style={styles.updateCard}>
          <Text style={styles.updateLabel}>Latest update</Text>
          <Text style={styles.updateText}>
            {activeAlert.latestUpdate ||
              "Follow the current emergency instructions."}
          </Text>
          <Text style={styles.updateTime}>
            Last updated: {activeAlert.updatedAtText || "just now"}
          </Text>
        </View>

        <CampusMapCard
          title="HHS Safety Map"
          currentLocation={profile.campusLocation}
          dangerZones={dangerZones}
          routeOverride={displayedRoute}
        />

        <View style={styles.instructionCard}>
          <Text style={styles.instructionMain}>
            {activeAlert.mainInstruction}
          </Text>
          <Text style={styles.instructionDetail}>{activeAlert.detail}</Text>
        </View>

        <View style={styles.routeCard}>
          <Text style={styles.routeLabel}>Your room</Text>
          <Text style={styles.routeValue}>{profile.room}</Text>

          <Text style={styles.routeLabel}>You are here</Text>
          <Text style={styles.routeValue}>{profile.campusLocation}</Text>

          <Text style={styles.routeLabel}>Guidance</Text>
          <Text style={styles.routeValue}>{displayedRoute}</Text>
        </View>

        {dangerZones.length > 0 && (
          <View style={styles.studentDangerCard}>
            <Text style={styles.studentDangerTitle}>Avoid These Areas</Text>
            {dangerZones.map((zone) => (
              <Text key={zone} style={styles.studentDangerText}>
                • {zone}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Your status</Text>
          <Text style={styles.statusValue}>{student.status}</Text>
          <Text style={styles.statusTime}>
            Last status update: {student.updatedAtText || "Not updated yet"}
          </Text>
        </View>

        <Pressable style={styles.safeButton} onPress={onSafe}>
          <Text style={styles.bigButtonText}>I’m Safe</Text>
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
  onSendAlertUpdate,
  onEndAlert,
  onResetProfile,
}) {
  const [updateText, setUpdateText] = useState("");
  const [routeOverride, setRouteOverride] = useState(
    "Proceed north to Athletic Fields Assembly Area"
  );
  const [selectedDangerZones, setSelectedDangerZones] = useState([]);

  useEffect(() => {
    if (!activeAlert) {
      setRouteOverride("Proceed north to Athletic Fields Assembly Area");
      setSelectedDangerZones([]);
      return;
    }

    setRouteOverride(
      activeAlert.routeOverride || "Proceed north to Athletic Fields Assembly Area"
    );
    setSelectedDangerZones(activeAlert.dangerZones || []);
  }, [activeAlert]);

  const visibleStudents =
    profile.role === "teacher"
      ? students.filter((student) => student.classCode === profile.classCode)
      : students;

  function toggleDangerZone(zone) {
    setSelectedDangerZones((currentZones) => {
      if (currentZones.includes(zone)) {
        return currentZones.filter((item) => item !== zone);
      }
      return [...currentZones, zone];
    });
  }

  function handleSendUpdate() {
    onSendAlertUpdate(updateText, selectedDangerZones, routeOverride);
    setUpdateText("");
  }

  return (
    <SafeAreaView style={styles.dashboardScreen}>
      <FlatList
        data={visibleStudents}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <Text style={styles.dashboardTitle}>
              {profile.role === "admin"
                ? "Admin Command Center"
                : "Teacher Dashboard"}
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

              {activeAlert && (
                <>
                  <Text style={styles.dashboardUpdateText}>
                    Update: {activeAlert.latestUpdate || "No update yet"}
                  </Text>
                  <Text style={styles.dashboardUpdateTime}>
                    Last updated: {activeAlert.updatedAtText || "just now"}
                  </Text>
                </>
              )}
            </View>

            {activeAlert && (
              <CampusMapCard
                title="Live HHS Map"
                currentLocation="Quad"
                dangerZones={activeAlert.dangerZones || []}
                routeOverride={activeAlert.routeOverride || activeAlert.route}
              />
            )}

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

                <Text style={styles.sectionTitle}>Danger Zones</Text>
                <Text style={styles.helperText}>
                  Tap any zone students must avoid.
                </Text>
                <ChipGrid
                  items={DANGER_ZONE_OPTIONS}
                  selectedItems={selectedDangerZones}
                  onToggle={toggleDangerZone}
                />

                <Text style={styles.sectionTitle}>Route Override</Text>
                <HorizontalChoiceList
                  items={ROUTE_OPTIONS}
                  selected={routeOverride}
                  onSelect={setRouteOverride}
                />

                <Text style={styles.sectionTitle}>Send Update</Text>
                <TextInput
                  style={styles.updateInput}
                  placeholder="Example: Building C is blocked. Use Field House route."
                  placeholderTextColor="#94A3B8"
                  value={updateText}
                  onChangeText={setUpdateText}
                  multiline
                />

                <Pressable
                  style={[
                    styles.sendUpdateButton,
                    !activeAlert && styles.disabledButton,
                  ]}
                  onPress={handleSendUpdate}
                  disabled={!activeAlert}
                >
                  <Text style={styles.sendUpdateButtonText}>
                    Send Alert Update
                  </Text>
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
          </View>
        }
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
            <Text style={styles.studentDetail}>Room: {item.room}</Text>
            <Text style={styles.studentDetail}>
              Campus Location: {item.campusLocation}
            </Text>
            <Text style={styles.studentDetail}>Class code: {item.classCode}</Text>
            <Text style={styles.studentDetail}>
              Accessibility: {item.accessibilityNeeds}
            </Text>
            <Text style={styles.studentStatus}>{item.status}</Text>
            <Text style={styles.studentDetail}>
              Last updated: {item.updatedAtText || "Not updated yet"}
            </Text>

            {item.status === "NEED_HELP" && item.helpReason && (
              <Text style={styles.helpReasonText}>
                Reason: {item.helpReason}
              </Text>
            )}
          </View>
        )}
        ListFooterComponent={
          <Pressable style={styles.resetButton} onPress={onResetProfile}>
            <Text style={styles.resetText}>Reset Demo Profile</Text>
          </Pressable>
        }
      />
    </SafeAreaView>
  );
}

function CampusMapCard({ title, currentLocation, dangerZones, routeOverride }) {
  const routePoints = useMemo(
    () => computeRoutePoints(currentLocation, routeOverride),
    [currentLocation, routeOverride]
  );

  const routeSegments = useMemo(
    () => buildRouteSegments(routePoints),
    [routePoints]
  );

  return (
    <View style={styles.mapCard}>
      <Text style={styles.mapCardTitle}>{title}</Text>
      <Text style={styles.mapCardSubtitle}>
        HHS visual navigation view
      </Text>

      <View style={styles.mapLegendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendBlue]} />
          <Text style={styles.legendText}>You are here</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendRed]} />
          <Text style={styles.legendText}>Danger zone</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendGreen]} />
          <Text style={styles.legendText}>Safe route</Text>
        </View>
      </View>

      <View style={styles.mapContainer}>
        <Image source={HHS_MAP} style={styles.mapImage} resizeMode="contain" />

        {routeSegments.map((segment, index) => (
          <RouteLine
            key={`${segment.from?.key}-${segment.to?.key}-${index}`}
            from={segment.from}
            to={segment.to}
          />
        ))}

        {MAP_LOCATIONS.map((location) => {
          const isCurrent = currentLocation === location.key;
          const isDanger = dangerZones.includes(location.key);
          const isRoutePoint = routePoints.some((point) => point?.key === location.key);

          return (
            <View
              key={location.key}
              style={[
                styles.mapPin,
                {
                  left: `${location.x}%`,
                  top: `${location.y}%`,
                },
              ]}
            >
              <View
                style={[
                  styles.mapPinDot,
                  isCurrent && styles.currentPin,
                  isDanger && styles.dangerPin,
                  !isCurrent && !isDanger && isRoutePoint && styles.routePin,
                ]}
              />
              {(isCurrent || isDanger) && (
                <View style={styles.mapPinLabel}>
                  <Text style={styles.mapPinLabelText}>{location.label}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.mapFooterBox}>
        <Text style={styles.mapFooterLabel}>Current location</Text>
        <Text style={styles.mapFooterValue}>{currentLocation}</Text>

        <Text style={styles.mapFooterLabel}>Route</Text>
        <Text style={styles.mapFooterValue}>
          {routeOverride || "Proceed north to Athletic Fields Assembly Area"}
        </Text>
      </View>
    </View>
  );
}

function RouteLine({ from, to }) {
  if (!from || !to) return null;

  const x1 = from.x;
  const y1 = from.y;
  const x2 = to.x;
  const y2 = to.y;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  return (
    <View
      style={[
        styles.routeLine,
        {
          left: `${x1}%`,
          top: `${y1}%`,
          width: `${length}%`,
          transform: [{ rotate: `${angle}deg` }],
        },
      ]}
    />
  );
}

function ChipGrid({ items, selectedItems, onToggle }) {
  return (
    <View style={styles.dangerZoneGrid}>
      {items.map((item) => (
        <Pressable
          key={item}
          style={[
            styles.dangerZoneChip,
            selectedItems.includes(item) && styles.dangerZoneChipSelected,
          ]}
          onPress={() => onToggle(item)}
        >
          <Text style={styles.dangerZoneChipText}>{item}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function HorizontalChoiceList({ items, selected, onSelect }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.horizontalChoices}
      contentContainerStyle={styles.horizontalChoicesContent}
    >
      {items.map((item) => (
        <Pressable
          key={item}
          style={[
            styles.choiceChip,
            selected === item && styles.choiceChipSelected,
          ]}
          onPress={() => onSelect(item)}
        >
          <Text style={styles.choiceChipText}>{item}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function getAlertCopy(type) {
  if (type === "fire") {
    return {
      title: "FIRE ALERT",
      mainInstruction: "EVACUATE NOW",
      detail: "Move quickly, stay calm, and follow the approved safe route.",
      route: "Proceed north to Athletic Fields Assembly Area",
    };
  }

  if (type === "lockdown") {
    return {
      title: "LOCKDOWN",
      mainInstruction: "DO NOT EVACUATE",
      detail: "Move away from doors and windows. Stay low, quiet, and out of sight.",
      route: "Shelter in place in nearest safe room",
    };
  }

  if (type === "earthquake") {
    return {
      title: "EARTHQUAKE",
      mainInstruction: "DROP, COVER, HOLD ON",
      detail: "Stay away from glass and heavy objects. Wait for visual updates.",
      route: "Shelter in place in nearest safe room",
    };
  }

  return {
    title: "DRILL MODE",
    mainInstruction: "THIS IS A DRILL",
    detail: "Practice the emergency response calmly and follow staff guidance.",
    route: "Proceed north to Athletic Fields Assembly Area",
  };
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: "#0B1220",
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
    backgroundColor: "#0B1220",
  },
  setupContent: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 50,
  },
  appTitle: {
    color: "white",
    fontSize: 34,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 12,
  },
  appSubtitle: {
    color: "#C7D2FE",
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
    color: "#C7D2FE",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#182235",
    color: "white",
    padding: 16,
    borderRadius: 16,
    fontSize: 18,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#273449",
  },
  roleRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  roleButton: {
    flex: 1,
    backgroundColor: "#24324A",
    padding: 12,
    borderRadius: 14,
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
  horizontalChoices: {
    marginBottom: 8,
  },
  horizontalChoicesContent: {
    gap: 8,
    paddingRight: 8,
  },
  choiceChip: {
    backgroundColor: "#24324A",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  choiceChipSelected: {
    backgroundColor: "#0EA5E9",
  },
  choiceChipText: {
    color: "white",
    fontSize: 14,
    fontWeight: "800",
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
    backgroundColor: "#0B1220",
    padding: 20,
  },
  normalTitle: {
    color: "white",
    fontSize: 34,
    fontWeight: "900",
    marginBottom: 10,
    textAlign: "center",
  },
  normalSubtitle: {
    color: "#C7D2FE",
    fontSize: 20,
    marginBottom: 24,
    textAlign: "center",
  },
  smallCard: {
    backgroundColor: "#162033",
    padding: 20,
    borderRadius: 20,
    width: "100%",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#273449",
  },
  smallDashboardCard: {
    backgroundColor: "#162033",
    padding: 16,
    borderRadius: 18,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#273449",
  },
  smallLabel: {
    color: "#8FA5C8",
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
    padding: 20,
    paddingTop: 50,
    paddingBottom: 40,
  },
  fireBackground: {
    backgroundColor: "#641B1B",
  },
  lockdownBackground: {
    backgroundColor: "#6B3F10",
  },
  earthquakeBackground: {
    backgroundColor: "#153A7A",
  },
  drillBackground: {
    backgroundColor: "#0B1220",
  },
  emergencyTitle: {
    color: "white",
    fontSize: 44,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 18,
  },
  updateCard: {
    backgroundColor: "#FEF3C7",
    padding: 18,
    borderRadius: 20,
    marginBottom: 16,
  },
  updateLabel: {
    color: "#78350F",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 6,
  },
  updateText: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 28,
  },
  updateTime: {
    color: "#78350F",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 8,
  },
  mapCard: {
    backgroundColor: "#101827",
    borderRadius: 22,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2B374B",
  },
  mapCardTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "900",
  },
  mapCardSubtitle: {
    color: "#A5B4FC",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
    marginBottom: 10,
  },
  mapLegendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  legendBlue: {
    backgroundColor: "#38BDF8",
  },
  legendRed: {
    backgroundColor: "#EF4444",
  },
  legendGreen: {
    backgroundColor: "#22C55E",
  },
  legendText: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700",
  },
  mapContainer: {
    position: "relative",
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: "#E5E7EB",
    borderRadius: 16,
    overflow: "hidden",
  },
  mapImage: {
    width: "100%",
    height: "100%",
  },
  mapPin: {
    position: "absolute",
    transform: [{ translateX: -8 }, { translateY: -8 }],
  },
  mapPinDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: "#94A3B8",
    borderWidth: 2,
    borderColor: "white",
  },
  currentPin: {
    backgroundColor: "#38BDF8",
    width: 20,
    height: 20,
  },
  dangerPin: {
    backgroundColor: "#EF4444",
    width: 18,
    height: 18,
  },
  routePin: {
    backgroundColor: "#22C55E",
  },
  mapPinLabel: {
    marginTop: 4,
    backgroundColor: "rgba(15, 23, 42, 0.88)",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
    maxWidth: 110,
  },
  mapPinLabelText: {
    color: "white",
    fontSize: 10,
    fontWeight: "800",
  },
  routeLine: {
    position: "absolute",
    height: 4,
    backgroundColor: "#22C55E",
    borderRadius: 999,
    transformOrigin: "left center",
  },
  mapFooterBox: {
    marginTop: 12,
    backgroundColor: "#162033",
    borderRadius: 16,
    padding: 12,
  },
  mapFooterLabel: {
    color: "#8FA5C8",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  mapFooterValue: {
    color: "white",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 22,
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
    backgroundColor: "rgba(255,255,255,0.14)",
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
  studentDangerCard: {
    backgroundColor: "#450A0A",
    borderColor: "#FCA5A5",
    borderWidth: 2,
    padding: 18,
    borderRadius: 18,
    marginBottom: 16,
  },
  studentDangerTitle: {
    color: "#FECACA",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },
  studentDangerText: {
    color: "white",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
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
  statusTime: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 6,
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
    backgroundColor: "#0B1220",
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
    backgroundColor: "#162033",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#273449",
  },
  activeAlertText: {
    color: "white",
    fontSize: 20,
    fontWeight: "800",
  },
  dashboardUpdateText: {
    color: "#E2E8F0",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 8,
    lineHeight: 22,
  },
  dashboardUpdateTime: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  adminPanel: {
    backgroundColor: "#101827",
    padding: 16,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#273449",
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
  dangerZoneGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  dangerZoneChip: {
    backgroundColor: "#24324A",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    marginBottom: 8,
  },
  dangerZoneChipSelected: {
    backgroundColor: "#DC2626",
  },
  dangerZoneChipText: {
    color: "white",
    fontSize: 14,
    fontWeight: "900",
  },
  updateInput: {
    backgroundColor: "#182235",
    color: "white",
    minHeight: 80,
    padding: 14,
    borderRadius: 14,
    fontSize: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#273449",
    textAlignVertical: "top",
  },
  sendUpdateButton: {
    backgroundColor: "#2563EB",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  disabledButton: {
    opacity: 0.45,
  },
  sendUpdateButtonText: {
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
  helpReasonText: {
    color: "#FECACA",
    fontSize: 15,
    fontWeight: "800",
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
});