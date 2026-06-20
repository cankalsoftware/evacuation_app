import { showToast } from "./Toast";
import React from "react";
import { View, ScrollView, ActivityIndicator, Modal, Platform, Image, Alert, useWindowDimensions, Linking, TouchableOpacity } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import LiveRollCall from "./LiveRollCall";

// Import Responsive Wrappers
import { Text, TextInput, MaterialCommunityIcons, FooterLinks } from "./ResponsiveUI";

let MapView: any = null;
let Marker: any = null;
let Polygon: any = null;
if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Marker = Maps.Marker;
    Polygon = Maps.Polygon;
  } catch (e) { }
}

// Math helpers to detect if polygon lines criss-cross (self-intersect)
function onSegment(p: any, q: any, r: any) {
  return q.lat <= Math.max(p.lat, r.lat) && q.lat >= Math.min(p.lat, r.lat) &&
    q.lon <= Math.max(p.lon, r.lon) && q.lon >= Math.min(p.lon, r.lon);
}

function orientation(p: any, q: any, r: any) {
  const val = (q.lon - p.lon) * (r.lat - q.lat) - (q.lat - p.lat) * (r.lon - q.lon);
  if (val === 0) return 0;
  return (val > 0) ? 1 : 2;
}

function doIntersect(p1: any, q1: any, p2: any, q2: any) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

function hasSelfIntersection(polygon: { lat: number, lon: number }[]) {
  if (!polygon || polygon.length < 4) return false;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const q1 = polygon[(i + 1) % polygon.length];
    for (let j = i + 2; j < polygon.length; j++) {
      if (i === 0 && j === polygon.length - 1) continue;
      const p2 = polygon[j];
      const q2 = polygon[(j + 1) % polygon.length];
      if (doIntersect(p1, q1, p2, q2)) return true;
    }
  }
  return false;
}

export default function AdminDashboard() {
  const { width, height } = useWindowDimensions();
  const { signOut } = useAuth();
  const { user } = useUser();
  const dashboardData = useQuery(api.portal.getDashboardData, { clerkId: user?.id });
  const saveBuilding = useMutation(api.portal.saveBuilding);
  const generateUploadUrl = useMutation(api.portal.generateUploadUrl);
  const updateBuildingImage = useMutation(api.portal.updateBuildingImage);
  const updateBuildingPolygon = useMutation(api.portal.updateBuildingPolygon);
  const updateBuildingInfo = useMutation(api.portal.updateBuildingInfo);
  const updateBuildingCalibration = useMutation(api.portal.updateBuildingCalibration);
  const updateBuildingGridPaths = useMutation(api.portal.updateBuildingGridPaths);
  const deleteBuilding = useMutation(api.portal.deleteBuilding);
  const triggerIncident = useMutation(api.portal.triggerIncident);
  const triggerSiteIncident = useMutation(api.portal.triggerSiteIncident);
  const resolveIncident = useMutation(api.portal.resolveIncident);
  const resolveSiteIncident = useMutation(api.portal.resolveSiteIncident);
  const scheduleDrill = useMutation(api.portal.scheduleDrill);
  const cancelDrill = useMutation(api.portal.cancelDrill);
  const activeIncidents = useQuery(api.portal.getActiveIncidents, { clerkId: user?.id }) || [];
  const recentIncidents = useQuery(api.portal.getRecentIncidents, { clerkId: user?.id }) || [];
  const allIncidentsHistory = useQuery(api.portal.getAllIncidentsHistory, { clerkId: user?.id });
  const notifyFireVisionNewAdmin = useAction(api.emails.notifyFireVisionNewAdmin);

  const [isRegistering, setIsRegistering] = React.useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [selectedBuilding, setSelectedBuilding] = React.useState<any>(null);

  const [hasPermissions, setHasPermissions] = React.useState(true);
  const [location, setLocation] = React.useState<Location.LocationObject | null>(null);
  const [refreshingLocation, setRefreshingLocation] = React.useState(false);

  const [isMapEditorOpen, setIsMapEditorOpen] = React.useState(false);
  const [isLocatingUser, setIsLocatingUser] = React.useState(false);
  const [mapEditorStep, setMapEditorStep] = React.useState<1 | 2>(1); // 1 = Calibration, 2 = Safe Routes
  const [gridPaintMode, setGridPaintMode] = React.useState<"safe" | "exit" | "erase" | "pan">("pan");
  const [gridSizeMeters, setGridSizeMeters] = React.useState(1.2);
  const scrollViewRef = React.useRef<ScrollView>(null);
  const [userZoom, setUserZoom] = React.useState(1);
  const [step1Zoom, setStep1Zoom] = React.useState(1);
  const [step1PanMode, setStep1PanMode] = React.useState(true);

  const [mapPanOffset, setMapPanOffset] = React.useState({ x: 0, y: 0 });
  const [step1PanOffset, setStep1PanOffset] = React.useState({ x: 0, y: 0 });

  const gestureState = React.useRef({
    isTwoFinger: false,
    initialDistance: 0,
    initialZoom: 1,
    lastCenter: { x: 0, y: 0 },
    lastPan: { x: 0, y: 0 }
  });

  const [activeCalibIdx, setActiveCalibIdx] = React.useState(0);
  const [calibPoints, setCalibPoints] = React.useState<{ x: number, y: number }[]>([]);
  const [gridPaths, setGridPaths] = React.useState<{ row: number, col: number, lat: number, lon: number, isExit: boolean }[]>([]);
  const [imgLayout, setImgLayout] = React.useState<{ w: number, h: number }>({ w: 1, h: 1 });
  const [imageAspectRatio, setImageAspectRatio] = React.useState<number | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [editingPins, setEditingPins] = React.useState<{ lat: number, lon: number, label?: string }[] | null>(null);
  const [editBName, setEditBName] = React.useState("");
  const [editBSite, setEditBSite] = React.useState("");
  const [editBAddress, setEditBAddress] = React.useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [confirmDialog, setConfirmDialog] = React.useState({ visible: false, title: "", message: "", onConfirm: () => { }, intent: "success" as "success" | "warning" | "danger" });

  const [manageSiteName, setManageSiteName] = React.useState<string | null>(null);
  const [siteDesc, setSiteDesc] = React.useState("");
  const [siteAdminName, setSiteAdminName] = React.useState("");
  const [sitePhone, setSitePhone] = React.useState("");
  const [siteEmergencyPhone, setSiteEmergencyPhone] = React.useState("");
  const [siteImageUri, setSiteImageUri] = React.useState<string | null>(null);
  const updateSiteInfo = useMutation(api.portal.updateSiteInfo);

  const [bName, setBName] = React.useState("");
  const [bSite, setBSite] = React.useState("");
  const [bAddress, setBAddress] = React.useState("");
  const [bPins, setBPins] = React.useState<{ lat: number, lon: number, label?: string }[]>([]);
  const [bImageUri, setBImageUri] = React.useState<string | null>(null);
  const [bImageMimeType, setBImageMimeType] = React.useState<string | null>(null);

  const addMapRef = React.useRef<any>(null);
  const editMapRef = React.useRef<any>(null);

  const [showAddMap, setShowAddMap] = React.useState(false);
  const [hasCenteredMap, setHasCenteredMap] = React.useState(false);

  React.useEffect(() => {
    if (isRegistering) {
      const timer = setTimeout(() => setShowAddMap(true), 300);
      return () => clearTimeout(timer);
    } else {
      setShowAddMap(false);
      setBName("");
      setBSite("");
      setBAddress("");
      setBPins([]);
      setBImageUri(null);
      setHasCenteredMap(false);
    }
  }, [isRegistering]);

  React.useEffect(() => {
    if (showAddMap && bName.length >= 2 && !hasCenteredMap && addMapRef.current) {
      setHasCenteredMap(true);
      (async () => {
        try {
          // Fetch fresh location just before the map unlocks
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setLocation(loc);
          if (bPins.length === 0) {
            addMapRef.current.animateToRegion({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            }, 1000);
          }
        } catch (e) {
          console.log("Error fetching fresh location after name entry", e);
        }
      })();
    }
  }, [showAddMap, bName, hasCenteredMap, bPins]);

  const [showEditMap, setShowEditMap] = React.useState(false);
  React.useEffect(() => {
    if (selectedBuilding) {
      const timer = setTimeout(() => setShowEditMap(true), 300);
      return () => clearTimeout(timer);
    } else {
      setShowEditMap(false);
    }
  }, [selectedBuilding]);

  React.useEffect(() => {
    if (selectedBuilding && dashboardData?.buildings) {
      const updated = dashboardData.buildings.find((b: any) => b._id === selectedBuilding._id);
      if (updated && updated.masterPlanUrl !== selectedBuilding.masterPlanUrl) {
        setSelectedBuilding((prev: any) => ({ ...prev, masterPlanUrl: updated.masterPlanUrl, masterPlanId: updated.masterPlanId }));
      }
    }
  }, [dashboardData?.buildings]);

  React.useEffect(() => {
    if (showEditMap && location && editMapRef.current && (!selectedBuilding?.polygon || selectedBuilding.polygon.length === 0)) {
      editMapRef.current.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 1000);
    }
  }, [showEditMap, location, selectedBuilding]);

  const [showSettings, setShowSettings] = React.useState(false);
  const [setupName, setSetupName] = React.useState("");
  const [setupPhone, setSetupPhone] = React.useState("");
  const [setupBusinessName, setSetupBusinessName] = React.useState("");
  const [setupBusinessAddress, setSetupBusinessAddress] = React.useState("");
  const [setupEmployerCount, setSetupEmployerCount] = React.useState("1-10");
  const [setupPostCode, setSetupPostCode] = React.useState("");
  const [setupCountry, setSetupCountry] = React.useState("");
  const [setupAgreedToTandC, setSetupAgreedToTandC] = React.useState(false);
  const [isSavingSetup, setIsSavingSetup] = React.useState(false);
  const [showValidation, setShowValidation] = React.useState(false);

  const step1MapRef = React.useRef<any>(null);
  const step2MapRef = React.useRef<any>(null);
  const [step1MapPos, setStep1MapPos] = React.useState({ x: 0, y: 0 });
  const [step2MapPos, setStep2MapPos] = React.useState({ x: 0, y: 0 });

  const fetchLocation = async () => {
    setRefreshingLocation(true);
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      const dbGranted = dashboardData?.permissionsGranted === true;
      
      if (dbGranted && status === 'granted') {
        let loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
      } else {
        setLocation(null);
      }
    } catch (e) {
      console.log("Error fetching location", e);
    } finally {
      setRefreshingLocation(false);
    }
  };

  React.useEffect(() => {
    setHasPermissions(dashboardData?.permissionsGranted === true);
  }, [showSettings, dashboardData]);

  React.useEffect(() => {
    if (showSettings && dashboardData) {
      setSetupName(dashboardData.name || "");
      setSetupPhone(dashboardData.phone || "");
      setSetupBusinessName(dashboardData.businessName || "");
      setSetupBusinessAddress(dashboardData.businessAddress || "");
      setSetupEmployerCount(dashboardData.employerCount || "1-10");
      setSetupPostCode(dashboardData.postCode || "");
      setSetupCountry(dashboardData.country || "");
      setSetupAgreedToTandC(dashboardData.agreedToTandC || false);
      fetchLocation();
    }
  }, [showSettings, dashboardData]);

  // Robust URI to Blob conversion for Android local file uris
  const uriToBlob = (uri: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        resolve(xhr.response);
      };
      xhr.onerror = function (e) {
        console.error("XHR error fetching blob", e);
        reject(new TypeError("Network request failed"));
      };
      xhr.responseType = "blob";
      xhr.open("GET", uri, true);
      xhr.send(null);
    });
  };
  const updateAdminProfile = useMutation(api.users.updateAdminProfile);
  const deleteIncidents = useMutation(api.portal.deleteIncidents);

  const groupedIncidents = React.useMemo(() => {
    if (!allIncidentsHistory) return {};
    const groups: { [month: string]: any[] } = {};
    allIncidentsHistory.forEach((inc: any) => {
      const date = new Date(inc.triggeredAt);
      const monthKey = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(inc);
    });
    return groups;
  }, [allIncidentsHistory]);

  const locatingIncidentId = React.useMemo(() => {
    if (!isLocatingUser || !selectedBuilding) return undefined;
    const inc = activeIncidents.find((i: any) => i.buildingId === selectedBuilding._id);
    return inc?.incidentId;
  }, [isLocatingUser, selectedBuilding, activeIncidents]);

  const rawEvacData = useQuery(api.portal.getEvacuationData, locatingIncidentId ? { clerkId: user?.id || "", incidentId: locatingIncidentId } : "skip");
  const locatingRollCall = rawEvacData ? rawEvacData.inside : [];

  const getDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getGridDimensions = () => {
    if (!selectedBuilding?.polygon || selectedBuilding.polygon.length < 4) return { rows: 1, cols: 1, minLat: 0, maxLat: 0, minLon: 0, maxLon: 0, cellLatSpan: 0, cellLonSpan: 0 };
    const poly = selectedBuilding.polygon;
    const minLat = Math.min(...poly.map((p: any) => p.lat));
    const maxLat = Math.max(...poly.map((p: any) => p.lat));
    const minLon = Math.min(...poly.map((p: any) => p.lon));
    const maxLon = Math.max(...poly.map((p: any) => p.lon));

    const heightMeters = getDistanceInMeters(minLat, minLon, maxLat, minLon);
    const widthMeters = getDistanceInMeters(minLat, minLon, minLat, maxLon);

    const cellLatSpan = heightMeters > 0 ? ((maxLat - minLat) / heightMeters) * gridSizeMeters : 0;
    const cellLonSpan = widthMeters > 0 ? ((maxLon - minLon) / widthMeters) * gridSizeMeters : 0;

    const rows = Math.max(1, Math.ceil(heightMeters / gridSizeMeters));
    const cols = Math.max(1, Math.ceil(widthMeters / gridSizeMeters));

    return { rows, cols, minLat, maxLat, minLon, maxLon, cellLatSpan, cellLonSpan };
  };

  const getDynamicMapHeight = () => {
    const containerWidth = width - 32; // Modal has px-4 (16px * 2)
    const ratio = imageAspectRatio || (4 / 3); // Fallback to 4:3
    const expectedImageHeight = containerWidth / ratio;
    
    // Add 40px total margin (20px top, 20px bottom)
    const heightWithMargins = expectedImageHeight + 40;
    
    // Cap at 75% of screen height to ensure UI fits on screen
    const maxHeight = height * 0.75;
    
    return Math.min(heightWithMargins, maxHeight);
  };

  const handleTouchStart = (
    e: any,
    currentZoom: number,
    currentPan: { x: number, y: number },
    isPanMode: boolean,
    onPaint?: (rawX: number, rawY: number) => void
  ) => {
    const touches = e.nativeEvent.touches;
    if (touches && touches.length >= 2) {
      gestureState.current.isTwoFinger = true;
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      gestureState.current.initialDistance = Math.sqrt(dx * dx + dy * dy);
      gestureState.current.initialZoom = currentZoom;
      gestureState.current.lastCenter = {
        x: (touches[0].pageX + touches[1].pageX) / 2,
        y: (touches[0].pageY + touches[1].pageY) / 2
      };
      gestureState.current.lastPan = currentPan;
    } else {
      gestureState.current.isTwoFinger = false;
      if (touches && touches.length === 1) {
        gestureState.current.lastCenter = { x: touches[0].pageX, y: touches[0].pageY };
        gestureState.current.lastPan = currentPan;
        if (!isPanMode && onPaint) {
          const lx = touches[0].locationX !== undefined ? touches[0].locationX : e.nativeEvent.locationX;
          const ly = touches[0].locationY !== undefined ? touches[0].locationY : e.nativeEvent.locationY;
          if (lx !== undefined && ly !== undefined) onPaint(lx, ly);
        }
      } else {
        // web single touch
        gestureState.current.lastCenter = { x: e.nativeEvent.pageX || 0, y: e.nativeEvent.pageY || 0 };
        gestureState.current.lastPan = currentPan;
        if (!isPanMode && onPaint) {
          let lx = (e.nativeEvent as any).offsetX;
          let ly = (e.nativeEvent as any).offsetY;
          if (lx === undefined && e.nativeEvent.touches && e.nativeEvent.touches.length > 0) {
            // Touch fallback
            const mapPos = onPaint === handleStep1Paint ? step1MapPos : step2MapPos;
            lx = e.nativeEvent.touches[0].pageX - mapPos.x;
            ly = e.nativeEvent.touches[0].pageY - mapPos.y;
          } else if (lx === undefined) {
            lx = e.nativeEvent.locationX;
            ly = e.nativeEvent.locationY;
          }
          if (lx !== undefined && ly !== undefined && !isNaN(lx) && !isNaN(ly)) onPaint(lx, ly);
        }
      }
    }
  };

  const handleTouchMove = (
    e: any,
    currentZoom: number,
    setZoom: (z: number) => void,
    setPan: (p: { x: number, y: number }) => void,
    isPanMode: boolean,
    onPaint?: (rawX: number, rawY: number) => void
  ) => {
    const touches = e.nativeEvent.touches;
    if (touches && touches.length >= 2) {
      if (!gestureState.current.isTwoFinger) {
        // Transitioned to 2 fingers
        handleTouchStart(e, currentZoom, gestureState.current.lastPan, isPanMode);
        return;
      }

      // Zoom
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const scaleFactor = dist / Math.max(1, gestureState.current.initialDistance);
      let newZoom = gestureState.current.initialZoom * scaleFactor;
      newZoom = Math.max(1, Math.min(5, newZoom));
      setZoom(newZoom);

      // Pan
      const center = {
        x: (touches[0].pageX + touches[1].pageX) / 2,
        y: (touches[0].pageY + touches[1].pageY) / 2
      };
      const diffX = center.x - gestureState.current.lastCenter.x;
      const diffY = center.y - gestureState.current.lastCenter.y;

      if (newZoom <= 1.01) {
        setPan({ x: 0, y: 0 });
      } else {
        setPan({
          x: gestureState.current.lastPan.x + diffX,
          y: gestureState.current.lastPan.y + diffY
        });
      }

    } else if (!gestureState.current.isTwoFinger) {
      // 1 finger
      if (isPanMode) {
        const pageX = touches ? touches[0].pageX : (e.nativeEvent.pageX || 0);
        const pageY = touches ? touches[0].pageY : (e.nativeEvent.pageY || 0);
        const diffX = pageX - gestureState.current.lastCenter.x;
        const diffY = pageY - gestureState.current.lastCenter.y;
        setPan({
          x: gestureState.current.lastPan.x + diffX,
          y: gestureState.current.lastPan.y + diffY
        });
      } else {
        let rawX = Platform.OS === 'web' && (e.nativeEvent as any).offsetX !== undefined ? (e.nativeEvent as any).offsetX : e.nativeEvent.locationX;
        let rawY = Platform.OS === 'web' && (e.nativeEvent as any).offsetY !== undefined ? (e.nativeEvent as any).offsetY : e.nativeEvent.locationY;
        if (rawX === undefined && e.nativeEvent.touches && e.nativeEvent.touches.length > 0) {
            const mapPos = onPaint === handleStep1Paint ? step1MapPos : step2MapPos;
            rawX = e.nativeEvent.touches[0].pageX - mapPos.x;
            rawY = e.nativeEvent.touches[0].pageY - mapPos.y;
        }
        if (onPaint && rawX !== undefined && rawY !== undefined && !isNaN(rawX) && !isNaN(rawY)) {
          onPaint(rawX, rawY);
        }
      }
    }
  };

  const getMapTransform = () => {
    let scale = 1;
    let translateX = mapPanOffset.x;
    let translateY = mapPanOffset.y;
    let maskW = imgLayout.w;
    let maskH = imgLayout.h;
    let boxCenterX;
    let boxCenterY;

    if (selectedBuilding?.imageCalibrationPoints?.length >= 4 && imgLayout.w > 1) {
      const calib = selectedBuilding.imageCalibrationPoints;
      const bounds = getRenderedImageBounds();
      const isLegacyPixels = calib[0].x > 2;
      const minCX = Math.min(...calib.map((c: any) => isLegacyPixels ? c.x / Math.max(1, imgLayout.w) : c.x));
      const maxCX = Math.max(...calib.map((c: any) => isLegacyPixels ? c.x / Math.max(1, imgLayout.w) : c.x));
      const minCY = Math.min(...calib.map((c: any) => isLegacyPixels ? c.y / Math.max(1, imgLayout.h) : c.y));
      const maxCY = Math.max(...calib.map((c: any) => isLegacyPixels ? c.y / Math.max(1, imgLayout.h) : c.y));

      const boxW_px = (maxCX - minCX) * bounds.renderW;
      const boxH_px = (maxCY - minCY) * bounds.renderH;

      if (boxW_px > 0 && boxH_px > 0) {
        // Fit building box into 90% of screen (5% margin each side)
        const targetW = imgLayout.w * 0.9;
        const targetH = imgLayout.h * 0.9;

        const baseScale = Math.min(targetW / boxW_px, targetH / boxH_px);
        scale = baseScale * userZoom;

        boxCenterX = bounds.offsetX + ((minCX + maxCX) / 2) * bounds.renderW;
        boxCenterY = bounds.offsetY + ((minCY + maxCY) / 2) * bounds.renderH;

        // Shift so that boxCenter lands exactly at the center of the full mask
        translateX = mapPanOffset.x - (boxCenterX - imgLayout.w / 2) * scale;
        translateY = mapPanOffset.y - (boxCenterY - imgLayout.h / 2) * scale;
      }
    }

    return { scale, translateX, translateY, maskW, maskH, boxCenterX, boxCenterY };
  };

  const handleStep1Paint = (rawX: number, rawY: number) => {
    const bounds = getRenderedImageBounds();
    const screenX = rawX;
    const screenY = rawY;
    const unzoomedX = imgLayout.w / 2 + (screenX - imgLayout.w / 2 - step1PanOffset.x) / step1Zoom;
    const unzoomedY = imgLayout.h / 2 + (screenY - imgLayout.h / 2 - step1PanOffset.y) / step1Zoom;

    const x = (unzoomedX - bounds.offsetX) / bounds.renderW;
    const y = (unzoomedY - bounds.offsetY) / bounds.renderH;

    if (activeCalibIdx === -1) return;
    if (isNaN(x) || isNaN(y)) return; // Protection against corrupted coordinates

    const isNewPlacement = !calibPoints[activeCalibIdx];
    const newPoints = [...calibPoints];
    newPoints[activeCalibIdx] = { x, y };
    setCalibPoints(newPoints);
  };

  const handleGridInteraction = (screenX: number, screenY: number) => {
    let rawX = screenX;
    let rawY = screenY;

    const unzoomedX = imgLayout.w / 2 + (screenX - imgLayout.w / 2 - step1PanOffset.x) / step1Zoom;
    const unzoomedY = imgLayout.h / 2 + (screenY - imgLayout.h / 2 - step1PanOffset.y) / step1Zoom;
    rawX = unzoomedX;
    rawY = unzoomedY;

    const gps = mapImageToGPS(rawX, rawY);
    const { rows, cols, minLat, maxLat, minLon, maxLon, cellLatSpan, cellLonSpan } = getGridDimensions();
    if (cellLatSpan <= 0 || cellLonSpan <= 0) return;

    let row = Math.floor((maxLat - gps.lat) / cellLatSpan);
    let col = Math.floor((gps.lon - minLon) / cellLonSpan);

    row = Math.max(0, Math.min(rows - 1, row));
    col = Math.max(0, Math.min(cols - 1, col));

    if (row >= 0 && col >= 0) {
      setGridPaths(prev => {
        const existingIdx = prev.findIndex(p => p.row === row && p.col === col);
        if (gridPaintMode === "erase") {
          if (existingIdx !== -1) {
            const newPaths = [...prev];
            newPaths.splice(existingIdx, 1);
            return newPaths;
          }
        } else {
          const newCell = {
            row, col,
            lat: maxLat - ((row + 0.5) * cellLatSpan),
            lon: minLon + ((col + 0.5) * cellLonSpan),
            isExit: gridPaintMode === "exit"
          };

          if (existingIdx !== -1) {
            if (prev[existingIdx].isExit === newCell.isExit) return prev; // No change needed
            const newPaths = [...prev];
            newPaths[existingIdx] = newCell;
            return newPaths;
          } else {
            return [...prev, newCell];
          }
        }
        return prev;
      });
    }
  };

  const exportLogs = async () => {
    if (!allIncidentsHistory || allIncidentsHistory.length === 0) {
      showToast("No history to export.");
      return;
    }

    try {
      const headers = ['Type', 'Site Name', 'Building Name', 'Start Time', 'Duration (Seconds)'];
      const rows = [headers.join(',')];

      for (const inc of allIncidentsHistory) {
        const type = inc.isDrill ? "Drill" : "Real Evacuation";
        const site = `"${inc.siteName || ''}"`;
        const building = `"${inc.buildingName || ''}"`;
        const start = `"${new Date(inc.triggeredAt).toLocaleString()}"`;
        const durationSecs = Math.floor(((inc.resolvedAt || Date.now()) - inc.triggeredAt) / 1000);

        rows.push([type, site, building, start, durationSecs].join(','));
      }

      const csvString = rows.join('\n');

      if (Platform.OS === 'web') {
        const blob = new Blob([csvString], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `evacuation_logs_${Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        const fileUri = `${(FileSystem as any).documentDirectory}evacuation_logs_${Date.now()}.csv`;
        await (FileSystem as any).writeAsStringAsync(fileUri, csvString, { encoding: (FileSystem as any).EncodingType.UTF8 });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Evacuation Logs' });
        } else {
          showToast("Sharing is not available on this device", "error");
        }
      }
    } catch (e) {
      console.log("Export failed", e);
      showToast("Failed to export logs", "error");
    }
  };

  const confirmAction = (title: string, message: string, onConfirm: () => void, intent: "success" | "warning" | "danger" = "success") => {
    setConfirmDialog({ visible: true, title, message, onConfirm, intent });
  };

  React.useEffect(() => {
    if (selectedBuilding?.masterPlanUrl) {
      Image.getSize(selectedBuilding.masterPlanUrl, (width, height) => {
        if (width && height) setImageAspectRatio(width / height);
      }, (err) => console.warn(err));
    }
  }, [selectedBuilding?.masterPlanUrl]);

  // Keep selectedBuilding in sync with database updates (like image uploads)
  React.useEffect(() => {
    if (selectedBuilding && dashboardData?.buildings) {
      if (selectedBuilding) {
        const updated = dashboardData.buildings.find((b: any) => b._id === selectedBuilding._id);
        if (updated && (
          updated.imageCalibrationPoints?.length !== selectedBuilding.imageCalibrationPoints?.length ||
          updated.polygon?.length !== selectedBuilding.polygon?.length ||
          updated.gridPaths?.length !== selectedBuilding.gridPaths?.length
        )) {
          setSelectedBuilding(updated);
        }
      }
    }
  }, [dashboardData, selectedBuilding]);

  const getRenderedImageBounds = () => {
    const layoutW = Math.max(1, imgLayout.w);
    const layoutH = Math.max(1, imgLayout.h);
    const aspect = imageAspectRatio || 1;
    const layoutAspect = layoutW / layoutH;
    let renderW, renderH, offsetX, offsetY;
    if (layoutAspect > aspect) {
      renderH = layoutH;
      renderW = layoutH * aspect;
      offsetX = (layoutW - renderW) / 2;
      offsetY = 0;
    } else {
      renderW = layoutW;
      renderH = layoutW / aspect;
      offsetX = 0;
      offsetY = (layoutH - renderH) / 2;
    }
    return { renderW, renderH, offsetX, offsetY };
  };

  const mapImageToGPS = (rawX: number, rawY: number) => {
    if (!selectedBuilding?.polygon || selectedBuilding.polygon.length < 4) return { lat: 0, lon: 0 };

    const bounds = getRenderedImageBounds();
    let u = (rawX - bounds.offsetX) / bounds.renderW;
    let v = (rawY - bounds.offsetY) / bounds.renderH;

    const calib = calibPoints.length >= 4 ? calibPoints : selectedBuilding.imageCalibrationPoints;
    if (calib && calib.length >= 4) {
      const isLegacyPixels = calib[0].x > 2;
      const minCX = Math.min(...calib.map((c: any) => isLegacyPixels ? c.x / Math.max(1, imgLayout.w) : c.x));
      const maxCX = Math.max(...calib.map((c: any) => isLegacyPixels ? c.x / Math.max(1, imgLayout.w) : c.x));
      const minCY = Math.min(...calib.map((c: any) => isLegacyPixels ? c.y / Math.max(1, imgLayout.h) : c.y));
      const maxCY = Math.max(...calib.map((c: any) => isLegacyPixels ? c.y / Math.max(1, imgLayout.h) : c.y));

      u = (u - minCX) / (maxCX - minCX || 1);
      v = (v - minCY) / (maxCY - minCY || 1);
    }

    const poly = selectedBuilding.polygon;
    const minLat = Math.min(...poly.map((p: any) => p.lat));
    const maxLat = Math.max(...poly.map((p: any) => p.lat));
    const minLon = Math.min(...poly.map((p: any) => p.lon));
    const maxLon = Math.max(...poly.map((p: any) => p.lon));

    const lat = maxLat - v * (maxLat - minLat);
    const lon = minLon + u * (maxLon - minLon);
    return { lat, lon };
  };

  const mapGPSToImage = (lat: number, lon: number) => {
    if (!selectedBuilding?.polygon || selectedBuilding.polygon.length < 4) return null;
    const poly = selectedBuilding.polygon;
    const minLat = Math.min(...poly.map((p: any) => p.lat));
    const maxLat = Math.max(...poly.map((p: any) => p.lat));
    const minLon = Math.min(...poly.map((p: any) => p.lon));
    const maxLon = Math.max(...poly.map((p: any) => p.lon));

    let v = (maxLat - lat) / (maxLat - minLat || 1);
    let u = (lon - minLon) / (maxLon - minLon || 1);

    const reqPins = selectedBuilding?.polygon?.length || 4;
    const currentCalib = calibPoints.filter(Boolean).length >= reqPins ? calibPoints.filter(Boolean) : selectedBuilding.imageCalibrationPoints;
    if (currentCalib && currentCalib.length >= reqPins) {
      const isLegacyPixels = currentCalib[0].x > 2;
      const minCX = Math.min(...currentCalib.map((c: any) => isLegacyPixels ? c.x / Math.max(1, imgLayout.w) : c.x));
      const maxCX = Math.max(...currentCalib.map((c: any) => isLegacyPixels ? c.x / Math.max(1, imgLayout.w) : c.x));
      const minCY = Math.min(...currentCalib.map((c: any) => isLegacyPixels ? c.y / Math.max(1, imgLayout.h) : c.y));
      const maxCY = Math.max(...currentCalib.map((c: any) => isLegacyPixels ? c.y / Math.max(1, imgLayout.h) : c.y));

      u = minCX + u * (maxCX - minCX);
      v = minCY + v * (maxCY - minCY);
    }
    return { x: u, y: v };
  };

  const handleNudgeCalib = (idx: number, dx: number, dy: number) => {
    const p = calibPoints[idx];
    if (!p) return;
    const bounds = getRenderedImageBounds();
    const isLegacyPixels = p.x > 2;

    const rawX = (isLegacyPixels ? p.x : bounds.offsetX + p.x * bounds.renderW) + (dx * 2);
    const rawY = (isLegacyPixels ? p.y : bounds.offsetY + p.y * bounds.renderH) + (dy * 2);

    const newX = (rawX - bounds.offsetX) / bounds.renderW;
    const newY = (rawY - bounds.offsetY) / bounds.renderH;

    if (isNaN(newX) || isNaN(newY)) return; // Protection against corrupted coordinates

    const newPoints = [...calibPoints];
    newPoints[idx] = { x: newX, y: newY };
    setCalibPoints(newPoints);
  };

  const performAutoZoom = () => {
    if (imgLayout.w > 1 && calibPoints.filter(Boolean).length >= 4) {
      const validPoints = calibPoints.filter(Boolean);
      const bounds = getRenderedImageBounds();
      const isLegacyPixels = validPoints[0].x > 2;
      
      const xs = validPoints.map((c: any) => isLegacyPixels ? c.x / Math.max(1, imgLayout.w) : c.x);
      const ys = validPoints.map((c: any) => isLegacyPixels ? c.y / Math.max(1, imgLayout.h) : c.y);
      
      if (xs.length > 0 && ys.length > 0) {
        const minCX = Math.min(...xs);
        const maxCX = Math.max(...xs);
        const minCY = Math.min(...ys);
        const maxCY = Math.max(...ys);

        const boxW_px = (maxCX - minCX) * bounds.renderW;
        const boxH_px = (maxCY - minCY) * bounds.renderH;

        if (boxW_px > 0 && boxH_px > 0) {
          const targetW = imgLayout.w * 0.9;
          const targetH = imgLayout.h * 0.9;

          const baseScale = Math.min(targetW / boxW_px, targetH / boxH_px);
          
          const boxCenterX = bounds.offsetX + ((minCX + maxCX) / 2) * bounds.renderW;
          const boxCenterY = bounds.offsetY + ((minCY + maxCY) / 2) * bounds.renderH;

          setStep1Zoom(baseScale);
          setStep1PanOffset({
            x: -(boxCenterX - imgLayout.w / 2),
            y: -(boxCenterY - imgLayout.h / 2)
          });
        }
      }
    }
  };

  const handleMapPress = (e: any) => {
    if (e.nativeEvent.coordinate) {
      const defaultLabels = ["Top Left", "Bottom Left", "Bottom Right", "Top Right"];
      const label = bPins.length < 4 ? defaultLabels[bPins.length] : `P${bPins.length + 1}`;
      setBPins([...bPins, { lat: parseFloat(e.nativeEvent.coordinate.latitude.toFixed(6)), lon: parseFloat(e.nativeEvent.coordinate.longitude.toFixed(6)), label }]);
    }
  };

  const handleSaveBuilding = async () => {
    if (bPins.length > 0 && bPins.length < 3) {
      showToast("Please drop at least 3 pins to create a polygon footprint, or leave it empty to configure later.");
      return;
    }
    if (!bName || !user?.id) return;

    try {
      setIsUploading(true);
      let storageId: any = undefined;

      // Upload the image first if provided
      if (bImageUri) {
        try {
          const postUrl = await generateUploadUrl();
          
          // Fallback for Android where fetch(fileUri) can sometimes fail
          const blob = await uriToBlob(bImageUri);
          
          const uploadResult = await fetch(postUrl, {
            method: "POST",
            headers: { "Content-Type": bImageMimeType || blob.type || "image/jpeg" },
            body: blob,
          });
          
          if (!uploadResult.ok) {
            console.error("Convex upload failed:", await uploadResult.text());
            throw new Error("Upload rejected by server");
          }
          
          const result = await uploadResult.json();
          storageId = result.storageId;
        } catch (imgError) {
          console.error("Image upload error:", imgError);
          showToast("Failed to upload image. Saving building without image.", "error");
        }
      }

      await saveBuilding({
        clerkId: user.id,
        name: bName,
        ...(bSite ? { siteName: bSite } : {}),
        address: bAddress || "No Address Provided",
        ...(bPins.length >= 3 && {
          latitude: bPins[0].lat,
          longitude: bPins[0].lon,
          polygon: bPins
        }),
        ...(storageId && { masterPlanId: storageId }),
      });

      setIsRegistering(false);
      setBName("");
      setBSite("");
      setBAddress("");
      setBPins([]);
      setBImageUri(null);
      setBImageMimeType(null);
      showToast("Building registered successfully!");
    } catch (e) {
      console.log(e);
      showToast("Error saving building.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const pickOrTakeImage = (onImageSelected: (uri: string, mimeType?: string) => void) => {
    Alert.alert(
      "Upload Master Plan Image",
      "Would you like to take a new photo, or upload an existing file?",
      [
        {
          text: "Take Photo",
          onPress: async () => {
            const camPerm = await ImagePicker.requestCameraPermissionsAsync();
            if (camPerm.granted === false) {
              showToast("Camera permission is required!", "error");
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.8,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              onImageSelected(result.assets[0].uri, result.assets[0].mimeType);
            }
          }
        },
        {
          text: "Upload Existing",
          onPress: () => {
            // Nested alert to bypass Android's 3-button limit
            Alert.alert(
              "Select Source",
              "Where is your file located?",
              [
                {
                  text: "Photo Gallery",
                  onPress: async () => {
                    const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                    if (libPerm.granted === false) {
                      showToast("Library permission is required!", "error");
                      return;
                    }
                    const result = await ImagePicker.launchImageLibraryAsync({
                      mediaTypes: ['images'],
                      quality: 0.8,
                    });
                    if (!result.canceled && result.assets && result.assets.length > 0) {
                      onImageSelected(result.assets[0].uri, result.assets[0].mimeType);
                    }
                  }
                },
                {
                  text: "Files / Cloud (Drive)",
                  onPress: async () => {
                    const result = await DocumentPicker.getDocumentAsync({
                      type: ['image/*'],
                      copyToCacheDirectory: true,
                    });
                    if (!result.canceled && result.assets && result.assets.length > 0) {
                      onImageSelected(result.assets[0].uri, result.assets[0].mimeType);
                    }
                  }
                },
                {
                  text: "Cancel",
                  style: "cancel"
                }
              ]
            );
          }
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };

  const handleUploadImage = async (buildingId: any) => {
    pickOrTakeImage(async (imageUri, mimeType) => {
      try {
        setIsUploading(true);
        const blob = await uriToBlob(imageUri);

        const uploadUrl = await generateUploadUrl();
        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": mimeType || blob.type || "image/jpeg" },
          body: blob,
        });

        if (!uploadResult.ok) {
          throw new Error("Upload rejected by server");
        }

        const { storageId } = await uploadResult.json();

        if (user?.id) {
          await updateBuildingImage({
            clerkId: user.id,
            buildingId,
            storageId
          });
          
          if (selectedBuilding && selectedBuilding._id === buildingId) {
            setSelectedBuilding({ ...selectedBuilding, masterPlanId: storageId });
          }
        }
        showToast("Image uploaded successfully!");
      } catch (e) {
        showToast("Error uploading image.", "error");
      } finally {
        setIsUploading(false);
      }
    });
  };

  if (dashboardData === undefined) {
    return (
      <View className="flex-1 bg-neutral-900 justify-center items-center">
        <ActivityIndicator color="red" size="large" />
      </View>
    );
  }

  if (dashboardData === null) {
    return (
      <View className="flex-1 bg-neutral-900 justify-center items-center">
        <Text className="text-white">Profile not fully synced yet.</Text>
      </View>
    );
  }

  const clerkEmail = user?.primaryEmailAddress?.emailAddress || "";
  const needsSetup = !dashboardData.name || !dashboardData.phone || !dashboardData.businessName;
  
  if (needsSetup || showSettings) {
    return (
      <View className="flex-1 bg-neutral-900 pt-6 px-4 md:px-6">
        <View className="flex-row justify-between items-center mb-8">
          <Text className="text-3xl font-extrabold text-white">
            {needsSetup ? "Admin Setup" : "Admin Settings"}
          </Text>
          {!needsSetup && (
            <TouchableOpacity onPress={() => setShowSettings(false)} className="bg-neutral-800 p-2 rounded-full">
              <Text className="text-white font-bold">✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
          <Text className="text-neutral-400 mb-6">
            {needsSetup
              ? "Welcome to FireVision Admin! Please provide your business and contact details before continuing."
              : "Update your emergency contact information below."}
          </Text>

          <View className="bg-neutral-800 p-6 rounded-3xl border border-neutral-700">
            <Text className="text-white font-bold mb-2">Admin Name</Text>
            <TextInput
              className={`bg-neutral-900 border ${showValidation && !(setupName || dashboardData.name) ? 'border-red-500' : 'border-neutral-700'} text-white p-4 rounded-xl mb-4`}
              placeholder="John Doe"
              placeholderTextColor="#666"
              value={setupName}
              onChangeText={setSetupName}
            />

            <Text className="text-white font-bold mb-2">Admin Email</Text>
            <TextInput
              className="bg-neutral-900 border border-neutral-700 text-neutral-400 p-4 rounded-xl mb-4 opacity-70"
              value={clerkEmail}
              editable={false}
            />

            <Text className="text-white font-bold mb-2">Admin Telephone</Text>
            <TextInput
              className={`bg-neutral-900 border ${showValidation && !(setupPhone || dashboardData.phone) ? 'border-red-500' : 'border-neutral-700'} text-white p-4 rounded-xl mb-4`}
              placeholder="+1 234 567 8900"
              placeholderTextColor="#666"
              keyboardType="phone-pad"
              value={setupPhone}
              onChangeText={setSetupPhone}
            />

            <View>
              <View className="h-[1px] bg-neutral-700 my-4" />
              <Text className="text-white font-bold text-lg mb-4">Business Details</Text>

                <Text className="text-white font-bold mb-2">Business Name</Text>
                <TextInput
                  className={`bg-neutral-900 border ${showValidation && !setupBusinessName ? 'border-red-500' : 'border-neutral-700'} text-white p-4 rounded-xl mb-4`}
                  placeholder="Acme Corp"
                  placeholderTextColor="#666"
                  value={setupBusinessName}
                  onChangeText={setSetupBusinessName}
                />

                <Text className="text-white font-bold mb-2">Business Address</Text>
                <TextInput
                  className={`bg-neutral-900 border ${showValidation && !setupBusinessAddress ? 'border-red-500' : 'border-neutral-700'} text-white p-4 rounded-xl mb-4`}
                  placeholder="123 Corporate Way, City, Postcode"
                  placeholderTextColor="#666"
                  value={setupBusinessAddress}
                  onChangeText={setSetupBusinessAddress}
                />

                <Text className="text-white font-bold mb-2">Registered Post or Zip Code</Text>
                <TextInput
                  className={`bg-neutral-900 border ${showValidation && !setupPostCode ? 'border-red-500' : 'border-neutral-700'} text-white p-4 rounded-xl mb-4`}
                  placeholder="AB12 3CD"
                  placeholderTextColor="#666"
                  value={setupPostCode}
                  onChangeText={setSetupPostCode}
                />

                <Text className="text-white font-bold mb-2">Country</Text>
                <TextInput
                  className={`bg-neutral-900 border ${showValidation && !setupCountry ? 'border-red-500' : 'border-neutral-700'} text-white p-4 rounded-xl mb-4`}
                  placeholder="United Kingdom"
                  placeholderTextColor="#666"
                  value={setupCountry}
                  onChangeText={setSetupCountry}
                />

                <Text className="text-white font-bold mb-2">Employer Count</Text>
                <View className="flex-row flex-wrap mb-6">
                  {['1-10', '10-50', '50-100', '100+'].map(count => (
                    <TouchableOpacity
                      key={count}
                      className={`px-4 py-2 rounded-lg border mr-2 mb-2 ${setupEmployerCount === count ? 'bg-blue-600 border-blue-500' : 'bg-neutral-900 border-neutral-700'}`}
                      onPress={() => setSetupEmployerCount(count)}
                    >
                      <Text className="text-white font-bold">{count}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View className="bg-neutral-900 p-4 rounded-xl mb-4 border border-neutral-700">
                  <Text className="text-neutral-400 text-sm">
                    Note: I agree to pay a subscription fee once my account is approved. (Currently in Test Mode, subscription details will be announced on firevision.uk in the near future).
                  </Text>
                </View>

                <View className="mb-4">
                  <Text className="text-white font-bold mb-2">Device Permissions</Text>
                  <TouchableOpacity 
                    className="flex-row items-center mb-2"
                    onPress={async () => {
                      if (hasPermissions) {
                        setHasPermissions(false);
                      } else {
                        setHasPermissions(true);
                        try {
                          const { status } = await Location.requestForegroundPermissionsAsync();
                          if (status === 'granted') {
                            const { status: pStatus } = await Notifications.requestPermissionsAsync();
                          } else {
                            alert("Location permission denied by OS. Please enable it in your device settings.");
                          }
                        } catch (e) {
                          console.warn(e);
                        }
                      }
                    }}
                  >
                    <View className={`w-6 h-6 rounded border items-center justify-center mr-3 ${hasPermissions ? 'bg-blue-600 border-blue-500' : 'bg-neutral-900 border-neutral-700'}`}>
                      {hasPermissions && <Text className="text-white font-bold text-xs">✓</Text>}
                    </View>
                    <Text className="text-neutral-300 flex-1">
                      Grant Location & Notification Permissions (Required for full access)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    onPress={fetchLocation}
                    disabled={refreshingLocation}
                    className="bg-neutral-900 p-4 rounded-xl border border-neutral-700 mb-6 flex-row items-center"
                  >
                    {refreshingLocation ? (
                      <ActivityIndicator color="white" size="large" className="mr-4" />
                    ) : (
                      <Text className="text-3xl mr-4">📍</Text>
                    )}
                    <View>
                      <Text className="text-neutral-400 text-xs uppercase mb-1 font-bold">Current Coordinates</Text>
                      {location ? (
                         <Text className="text-white font-mono text-xs">
                           Lat: {location.coords.latitude.toFixed(6)}{"\n"}
                           Lon: {location.coords.longitude.toFixed(6)}
                         </Text>
                      ) : (
                         <Text className="text-neutral-500 italic text-xs">Waiting for GPS lock...</Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    onPress={fetchLocation}
                    disabled={refreshingLocation}
                    className="flex-row justify-center items-center py-3 bg-neutral-700 rounded-xl border border-neutral-600"
                  >
                    {refreshingLocation ? <ActivityIndicator color="white" className="mr-2" /> : <Text className="mr-2 text-xl">🛰️</Text>}
                    <Text className="text-white font-bold">Force Refresh Location</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  className="flex-row items-center mb-8"
                  onPress={() => setSetupAgreedToTandC(!setupAgreedToTandC)}
                >
                  <View className={`w-6 h-6 rounded border items-center justify-center mr-3 ${setupAgreedToTandC ? 'bg-blue-600 border-blue-500' : (showValidation && !setupAgreedToTandC ? 'bg-red-900/50 border-red-500' : 'bg-neutral-900 border-neutral-700')}`}>
                    {setupAgreedToTandC && <Text className="text-white font-bold text-xs">✓</Text>}
                  </View>
                  <Text className={`flex-1 ${showValidation && !setupAgreedToTandC ? 'text-red-400' : 'text-neutral-300'}`}>
                    I confirm and agree to the <Text className="underline" onPress={() => Linking.openURL('https://www.firevision.uk/terms')}>terms and conditions</Text>.
                  </Text>
                </TouchableOpacity>
              </View>

            <TouchableOpacity
              className={`bg-blue-600 py-4 rounded-xl items-center mb-6 ${isSavingSetup ? 'opacity-50' : ''}`}
              disabled={isSavingSetup}
              onPress={async () => {
                const effectiveName = setupName;
                const effectivePhone = setupPhone;
                
                if (!effectiveName || !effectivePhone || !setupBusinessName || !setupBusinessAddress || !setupPostCode || !setupCountry || !setupAgreedToTandC) {
                  setShowValidation(true);
                  showToast("Please fill in all required fields", "error");
                  return;
                }

                if (needsSetup) {
                  const email = clerkEmail.toLowerCase();
                  const domain = email.split('@')[1];
                  const publicDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'protonmail.com'];
                  
                  if (!domain || publicDomains.includes(domain)) {
                    showToast("Public email domains are not allowed. Please register with a corporate domain.", "error");
                    return;
                  }
                  
                  const bNameRaw = setupBusinessName.toLowerCase().replace(/[^a-z0-9]/g, '');
                  const domainName = domain ? domain.split('.')[0] : '';
                  const minRequiredLength = Math.max(3, Math.floor(bNameRaw.length / 2));
                  
                  if (!bNameRaw || !domainName || (!domainName.includes(bNameRaw.substring(0, minRequiredLength)) && !bNameRaw.includes(domainName.substring(0, minRequiredLength)))) {
                    alert("Your email domain does not appear to match your business name. Please register with a matching corporate email, or contact info@firevision.uk with your details for manual approval.");
                    return;
                  }
                }

                setIsSavingSetup(true);
                try {
                  const { status: locStatus } = await Location.getForegroundPermissionsAsync();
                  const { status: pushStatus } = await Notifications.getPermissionsAsync();
                  
                  await updateAdminProfile({
                    clerkId: user?.id || "",
                    name: setupName || "",
                    phone: setupPhone || "",
                    permissionsGranted: hasPermissions,
                    businessName: setupBusinessName || "",
                    businessAddress: setupBusinessAddress || "",
                    employerCount: setupEmployerCount || "1-10",
                    postCode: setupPostCode || "",
                    country: setupCountry || "",
                    agreedToTandC: setupAgreedToTandC,
                  });
                  
                  if (needsSetup) {
                    try {
                      await notifyFireVisionNewAdmin({
                        clerkId: user?.id || "",
                        name: setupName || "",
                        email: clerkEmail,
                        businessName: setupBusinessName || "",
                        phone: setupPhone || "",
                      });
                    } catch (err) {
                      console.warn("Failed to notify FireVision", err);
                    }
                  }
                  
                  setShowSettings(false);
                } catch (e) {
                  showToast("Error saving profile", "error");
                } finally {
                  setIsSavingSetup(false);
                }
              }}
            >
              {isSavingSetup ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">{needsSetup ? "Submit for Approval" : "Save Details"}</Text>}
            </TouchableOpacity>

          {!needsSetup && (
            <TouchableOpacity
              className="bg-neutral-800 border border-neutral-700 py-4 rounded-xl items-center flex-row justify-center"
              onPress={async () => {
                try {
                  const passkey = await user?.createPasskey();
                  if (passkey) showToast("Passkey created successfully! You can now use FaceID/TouchID to sign in.");
                } catch (e: any) {
                  showToast(e.errors?.[0]?.longMessage || e.message || "Error creating passkey. Your device might not support it.");
                }
              }}
            >
              <Text className="text-2xl mr-2">🔑</Text>
              <Text className="text-white font-bold text-lg">Create Biometric Passkey</Text>
            </TouchableOpacity>
          )}
        </View>

          {needsSetup && (
            <TouchableOpacity className="mt-8 self-center" onPress={() => signOut()}>
              <Text className="text-neutral-500">Sign Out</Text>
            </TouchableOpacity>
          )}

          <FooterLinks />
        </ScrollView>
      </View>
    );
  }

  if (dashboardData.approvalStatus === "pending") {
    return (
      <View className="flex-1 bg-neutral-900 justify-center items-center p-6">
        <View className="w-full mb-8">
            <Image
              source={require('../FireVision.png')}
              style={{ width: '100%', height: 100 }}
              resizeMode="contain"
            />
        </View>
        <Text className="text-6xl mb-6">⏳</Text>
        <Text className="text-white text-3xl font-extrabold text-center mb-4">Pending Approval</Text>
        <Text className="text-neutral-300 text-center text-lg mb-8">
          Registration Successful. Firevision will confirm your details and contact you to activate your admin account.
        </Text>
        <TouchableOpacity className="bg-neutral-800 border border-neutral-700 py-3 px-8 rounded-xl" onPress={() => signOut()}>
          <Text className="text-white font-bold text-lg">Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-900 pt-6">
      {/* Top Warning Banner */}
      {!hasPermissions && (
        <View className="bg-red-900/80 p-3 mt-2 mx-6 rounded-lg border border-red-500">
          <Text className="text-white text-center text-xs font-bold">You must approve location and notification permissions in settings.</Text>
        </View>
      )}

      {/* Header */}
      <View className="px-6 flex-row justify-between items-center my-6">
        <View className="flex-1 mr-4">
          <Text className="text-2xl font-extrabold text-white">Admin Console</Text>
          <Text className="text-red-400 font-bold text-xs mt-1" numberOfLines={1} ellipsizeMode="tail">{dashboardData.name || user?.primaryEmailAddress?.emailAddress}</Text>
        </View>
        <View className="flex-row items-center shrink-0">
          <TouchableOpacity
            className={`p-3 rounded-full border mr-2 ${!hasPermissions ? 'bg-red-600 border-red-400 shadow-[0_0_15px_rgba(220,38,38,0.8)]' : 'bg-neutral-800 border-neutral-700'}`}
            onPress={() => setShowSettings(true)}
          >
            <Text className="text-white">⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-neutral-800 px-3 py-2 rounded-full border border-neutral-700 shrink flex-1 max-w-[80px] items-center justify-center"
            onPress={() => signOut()}
          >
            <Text adjustsFontSizeToFit numberOfLines={1} className="text-white text-sm font-bold text-center">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Quick Actions */}
        <View className="flex-row space-x-4 mb-8">
          <TouchableOpacity
            className={`flex-1 border p-4 rounded-2xl items-center mr-2 ${!hasPermissions ? 'bg-neutral-800/50 border-neutral-700 opacity-50' : 'bg-neutral-800 border-neutral-700'}`}
            onPress={() => {
              if (!hasPermissions) {
                showToast("Permissions required to add locations", "error");
                return;
              }
              setIsRegistering(true);
            }}
            disabled={!hasPermissions}
          >
            <Text className="text-2xl mb-1">🗺️</Text>
            <Text className="text-white font-bold text-center text-xs">Add Location</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 bg-neutral-800 border border-neutral-700 p-4 rounded-2xl items-center ml-2"
            onPress={() => setIsHistoryOpen(true)}
          >
            <Text className="text-2xl mb-1">📋</Text>
            <Text className="text-white font-bold text-center text-xs">History Logs</Text>
          </TouchableOpacity>
        </View>

        {(() => {
          if (!dashboardData.buildings || dashboardData.buildings.length === 0) {
            return (
              <View className="bg-neutral-800 border border-neutral-700 p-6 rounded-2xl items-center mb-8">
                <Text className="text-neutral-400 text-center">You have not registered any buildings yet.</Text>
                <TouchableOpacity 
                  className={`mt-4 px-4 py-2 rounded-lg ${!hasPermissions ? 'bg-white/5 opacity-50' : 'bg-white/10'}`} 
                  onPress={() => hasPermissions ? setIsRegistering(true) : showToast("Permissions required", "error")}
                  disabled={!hasPermissions}
                >
                  <Text className="text-white font-bold">Register Building</Text>
                </TouchableOpacity>
              </View>
            );
          }

          const sites: { [key: string]: any[] } = {};
          const independent: any[] = [];
          dashboardData.buildings.forEach((b: any) => {
            if (b.siteName && b.siteName.trim().length > 0) {
              if (!sites[b.siteName]) sites[b.siteName] = [];
              sites[b.siteName].push(b);
            } else {
              independent.push(b);
            }
          });

          const renderBuilding = (building: any) => {
            const isComplete = building.polygon && building.polygon.length >= 3 &&
              building.masterPlanId &&
              building.imageCalibrationPoints && building.imageCalibrationPoints.length >= 3 &&
              building.gridPaths && building.gridPaths.some((n: any) => n.isExit);
            const activeIncident = activeIncidents.find((i: any) => i.buildingId === building._id);
            const isAlarming = !!activeIncident;

            return (
              <View key={building._id} className={`bg-neutral-800 border ${isAlarming ? (activeIncident.isDrill ? 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]' : 'border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.5)]') : 'border-neutral-700'} p-4 rounded-2xl mb-4`}>
                <View className="flex-row justify-between items-center mb-3">
                  <View className="flex-row items-center flex-1">
                    <Text className="text-white font-bold text-xl mr-2 shrink" numberOfLines={1}>{building.name}</Text>
                    <TouchableOpacity
                      className="bg-neutral-700/50 p-3 rounded-full"
                      onPress={async () => {
                        const defaultLabels = ["Top Left", "Bottom Left", "Bottom Right", "Top Right"];
                        const populatedPolygon = (building.polygon || []).map((p: any, i: number) => ({
                          ...p,
                          label: p.label || (i < 4 ? defaultLabels[i] : `P${i + 1}`)
                        }));
                        setSelectedBuilding({ ...building, polygon: populatedPolygon });
                        setEditingPins(populatedPolygon);
                        setIsLocatingUser(false);
                        setEditBName(building.name);
                        setEditBSite(building.siteName || "");
                        setEditBAddress(building.address === "No Address Provided" ? "" : building.address);
                      }}
                    >
                      <Text className="text-2xl">⚙️</Text>
                    </TouchableOpacity>
                  </View>

                  {!isAlarming && isComplete && (
                    <TouchableOpacity
                      className="bg-amber-600/80 px-4 py-2 rounded-lg border border-amber-500 ml-2 shrink-0"
                      onPress={() => confirmAction("Start Test Drill", `Are you sure you want to manually start a TEST DRILL for ${building.name}?`, () => triggerIncident({ clerkId: user?.id || "", buildingId: building._id, isDrill: true }), "warning")}
                    >
                      <Text className="text-white font-bold text-sm">🔔 Drill</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Info Messages Below */}
                <View className="flex-col items-start mb-2">
                  {(!building.address || building.address === "No Address Provided") ? (
                    <View className="bg-amber-900/30 px-2 py-1 rounded-md border border-amber-500/30 mb-2">
                      <Text className="text-amber-500 text-[10px] font-bold">⚠️ Missing Address</Text>
                    </View>
                  ) : (
                    <Text className="text-neutral-400 text-sm mb-2">{building.address}</Text>
                  )}
                  {isComplete ? (
                    <View className="bg-green-900/30 px-2 py-1 rounded-md border border-green-500/30">
                      <Text className="text-green-400 text-[10px] font-bold">🟢 ACTIVE</Text>
                    </View>
                  ) : (
                    <View className="bg-red-900/30 px-2 py-1 rounded-md border border-red-500/30">
                      <Text className="text-red-400 text-[10px] font-bold">🔴 INCOMPLETE: Missing Setup</Text>
                    </View>
                  )}
                </View>

                {isComplete && (
                  <View className="border-t border-neutral-700 pt-3 mt-1">
                    {isAlarming ? (
                      <View>
                        <TouchableOpacity
                          className={`w-full py-3 rounded-lg flex-row items-center justify-center ${activeIncident.isDrill ? 'bg-amber-600' : 'bg-green-600'}`}
                          onPress={() => confirmAction(activeIncident.isDrill ? "Resolve Drill" : "Resolve Evacuation", `Are you sure you want to end the ${activeIncident.isDrill ? 'drill' : 'evacuation'} for ${building.name}?`, () => resolveIncident({ clerkId: user?.id || "", buildingId: building._id }))}
                        >
                          <Text className="text-white font-bold text-center">✅ Resolve {activeIncident.isDrill ? 'Drill' : 'Evacuation'}</Text>
                        </TouchableOpacity>

                        <LiveRollCall
                          clerkId={user?.id || ""}
                          incidentId={activeIncident.incidentId}
                          buildingPolygon={building.polygon}
                          onLocateUser={(lat, lon, name) => {
                            setSelectedBuilding(building);
                            setEditingPins([{ lat, lon, label: name }]);
                            setIsLocatingUser(true);
                            setIsMapEditorOpen(true);
                          }}
                        />
                      </View>
                    ) : (
                      <View className="pt-2">
                        <TouchableOpacity
                          className="bg-red-600 w-full py-4 rounded-lg flex-row items-center justify-center border border-red-500 shadow-lg"
                          onPress={() => confirmAction("Trigger Evacuation", `Are you sure you want to trigger the REAL evacuation for ${building.name}? This will alert all guests.`, () => triggerIncident({ clerkId: user?.id || "", buildingId: building._id, isDrill: false }), "danger")}
                        >
                          <Text className="text-white font-bold text-center text-base tracking-widest" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>🚨 EVACUATE BUILDING</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          };

          return (
            <View>
              {Object.keys(sites).map(siteName => {
                const siteBuildings = sites[siteName];
                const activeIncidentsForSite = siteBuildings.map(b => activeIncidents.find((i: any) => i.buildingId === b._id)).filter(Boolean);
                const activeCount = activeIncidentsForSite.length;
                const activeInSite = activeCount > 0;
                const allInSiteActive = activeCount === siteBuildings.length;
                const isRealEmergency = activeIncidentsForSite.some((i: any) => !i.isDrill);
                const siteDetail = dashboardData?.sites?.find((s: any) => s.name === siteName);
                const isSiteComplete = siteBuildings.every(b => b.polygon && b.polygon.length >= 3 && b.masterPlanId && b.imageCalibrationPoints && b.imageCalibrationPoints.length >= 3 && b.gridPaths && b.gridPaths.some((n: any) => n.isExit));

                let siteStatusClass = 'border border-neutral-700/60';
                if (allInSiteActive) {
                  siteStatusClass = isRealEmergency
                    ? 'border-2 border-red-500 shadow-lg shadow-red-500/40 bg-red-950/10'
                    : 'border-2 border-amber-500 shadow-lg shadow-amber-500/40 bg-amber-950/10';
                } else if (activeInSite) {
                  siteStatusClass = isRealEmergency
                    ? 'border-2 border-red-500/50 shadow-md shadow-red-500/20'
                    : 'border-2 border-amber-500/50 shadow-md shadow-amber-500/20';
                }

                return (
                  <View key={siteName} className={`mb-10 bg-neutral-800/40 rounded-[32px] overflow-hidden -mx-2 ${siteStatusClass}`}>
                    <View className="flex-row justify-between items-center bg-neutral-800/60 p-5 border-b border-neutral-700/50">
                      <View className="flex-row items-center flex-1">
                        <Text className="text-2xl font-black text-white tracking-wide mr-3 shrink">{siteName}</Text>
                        <TouchableOpacity
                          className="bg-neutral-700/50 p-3 rounded-full"
                          onPress={() => {
                            setManageSiteName(siteName);
                            setSiteDesc(siteDetail?.description || "");
                            setSiteAdminName(siteDetail?.adminContactName || "");
                            setSitePhone(siteDetail?.contactPhone || "");
                            setSiteEmergencyPhone(siteDetail?.emergencyServicesPhone || "");
                          }}
                        >
                          <Text className="text-2xl">⚙️</Text>
                        </TouchableOpacity>
                      </View>

                      {!allInSiteActive && isSiteComplete && siteBuildings.length > 0 && (
                        <TouchableOpacity
                          className="bg-amber-600/80 px-4 py-2 rounded-lg border border-amber-500 ml-2"
                          onPress={() => confirmAction("Test Drill Site", `Are you sure you want to trigger a mass TEST DRILL for ALL buildings in ${siteName}?`, () => triggerSiteIncident({ clerkId: user?.id || "", siteName, isDrill: true }), "warning")}
                        >
                          <Text className="text-white font-bold text-sm">🔔 Drill Site</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {(!siteDetail || !siteDetail.description || !siteDetail.contactPhone) && (
                      <View className="bg-amber-900/40 p-4 border-b border-neutral-700/50 flex-row items-center">
                        <Text className="text-amber-500 text-xl mr-3">⚠️</Text>
                        <View className="flex-1">
                          <Text className="text-amber-500 font-bold mb-1">Missing Site Details</Text>
                          <Text className="text-amber-400/80 text-xs">Tap the ⚙️ icon to configure the fire service info for this site.</Text>
                        </View>
                      </View>
                    )}

                    <View className="p-4 pt-6">
                      {siteBuildings.map(b => renderBuilding(b))}
                    </View>

                    {/* Separated Evacuate Footer */}
                    {siteBuildings.length > 0 && (
                      <View className="bg-neutral-800/80 p-5 border-t border-neutral-700/50">
                        {allInSiteActive ? (
                          <TouchableOpacity
                            className="bg-green-600 w-full py-4 rounded-xl shadow-sm items-center justify-center border border-green-500"
                            onPress={() => confirmAction(isRealEmergency ? "Resolve Site Emergency" : "Resolve Site Drill", isRealEmergency ? `Are you sure you want to end the real evacuation for all buildings in ${siteName}?` : `Are you sure you want to end the test drill for all buildings in ${siteName}?`, () => resolveSiteIncident({ clerkId: user?.id || "", siteName }), "success")}
                          >
                            <Text className="text-white text-base font-bold text-center">✅ Resolve {isRealEmergency ? 'Entire Site' : 'Site Drill'}</Text>
                          </TouchableOpacity>
                        ) : !isSiteComplete ? (
                          <View className="bg-red-900/30 px-4 py-4 rounded-xl border border-red-500/30 items-center">
                            <Text className="text-red-400 font-bold text-center">⚠️ Cannot Evacuate Site{'\n'}One or more buildings are missing setup</Text>
                          </View>
                        ) : activeInSite ? (
                          <View className="flex-row space-x-2 mb-2">
                            <TouchableOpacity
                              className={`flex-1 py-3 rounded-xl shadow-sm items-center justify-center border ${isRealEmergency ? 'bg-amber-500 border-amber-600' : 'bg-blue-500 border-blue-600'}`}
                              onPress={() => confirmAction(isRealEmergency ? "Evacuate Rest of Site" : "Drill Rest of Site", isRealEmergency ? `Some buildings are already evacuating. Trigger real alarms for the remaining buildings in ${siteName}?` : `Some buildings are already drilling. Trigger test alarms for the remaining buildings in ${siteName}?`, () => triggerSiteIncident({ clerkId: user?.id || "", siteName, isDrill: !isRealEmergency }), isRealEmergency ? "danger" : "warning")}
                            >
                              <Text className="text-white text-xs font-bold text-center">{isRealEmergency ? `Evacuate Rest of\nSite` : `Drill Rest of\nSite`}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              className="flex-1 bg-green-600 py-3 rounded-xl shadow-sm items-center justify-center border border-green-500"
                              onPress={() => confirmAction(isRealEmergency ? "Resolve Partial Evacuation" : "Resolve Partial Drill", isRealEmergency ? `Are you sure you want to resolve the ongoing real alarms for the evacuating buildings in ${siteName}?` : `Are you sure you want to resolve the ongoing test drills in ${siteName}?`, () => resolveSiteIncident({ clerkId: user?.id || "", siteName }), "success")}
                            >
                              <Text className="text-white text-xs font-bold text-center">Resolve Partial{'\n'}{isRealEmergency ? 'Evacuation' : 'Drill'}</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View>
                            <TouchableOpacity
                              className="w-full bg-red-600 border-2 border-red-500 py-4 rounded-xl flex-row justify-center items-center shadow-[0_0_15px_rgba(220,38,38,0.4)]"
                              onPress={() => confirmAction("Evacuate Site", `Are you sure you want to trigger a mass evacuation for ALL buildings in ${siteName}?`, () => triggerSiteIncident({ clerkId: user?.id || "", siteName, isDrill: false }), "danger")}
                            >
                              <Text className="text-white text-base font-black tracking-widest text-center" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>🚨 EVACUATE ENTIRE SITE 🚨</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}

              {independent.length > 0 && (
                <View className="mb-10 bg-neutral-900 border border-neutral-800 rounded-[32px] p-5 shadow-lg -mx-2">
                  <Text className="text-xl font-bold text-white mb-5 border-b border-neutral-800 pb-3 px-1">Independent Buildings</Text>
                  {independent.map(b => renderBuilding(b))}
                </View>
              )}
            </View>
          );
        })()}

        {/* Recent Incidents moved to Modal */}

        {/* Footer */}
        <View className="mt-4 mb-8 pt-6 border-t border-neutral-800 items-center px-4">
          <Text className="text-neutral-500 text-xs text-center mb-4">
            © 2026 FireVision. All rights reserved.
          </Text>
          <View className="flex-row flex-wrap justify-center items-center">
            <TouchableOpacity onPress={() => alert("Privacy Policy coming soon")} className="mb-3">
              <Text className="text-neutral-400 text-xs font-semibold">Privacy Policy</Text>
            </TouchableOpacity>
            <Text className="text-neutral-600 mx-2 mb-3">|</Text>
            <TouchableOpacity onPress={() => alert("Terms of Service coming soon")} className="mb-3">
              <Text className="text-neutral-400 text-xs font-semibold">Terms of Service</Text>
            </TouchableOpacity>
            <Text className="text-neutral-600 mx-2 mb-3">|</Text>
            <TouchableOpacity onPress={() => alert("Cookie Policy coming soon")} className="mb-3">
              <Text className="text-neutral-400 text-xs font-semibold">Cookie Policy</Text>
            </TouchableOpacity>
            <Text className="text-neutral-600 mx-2 mb-3">|</Text>
            <TouchableOpacity onPress={() => alert("Acceptable Use coming soon")} className="mb-3">
              <Text className="text-neutral-400 text-xs font-semibold">Acceptable Use</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Register Building Modal */}
      <Modal visible={isRegistering} animationType="slide" presentationStyle="pageSheet">
        <ScrollView className="flex-1 bg-neutral-900 pt-12 px-6" contentContainerStyle={{ paddingBottom: 120 }}>
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-2xl font-extrabold text-white">New Building</Text>
            <TouchableOpacity onPress={() => setIsRegistering(false)} className="bg-neutral-800 p-2 rounded-full border border-neutral-700">
              <Text className="text-white font-bold">✕</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 text-white mb-4"
            placeholder="Building Name (e.g. Warehouse A)"
            placeholderTextColor="#525252"
            value={bName}
            onChangeText={setBName}
          />
          <TextInput
            className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 text-white mb-4"
            placeholder="Site Name (Optional) - e.g. North Campus"
            placeholderTextColor="#525252"
            value={bSite}
            onChangeText={setBSite}
          />
          <TextInput
            className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 text-white mb-4"
            placeholder="Address (Optional)"
            placeholderTextColor="#525252"
            value={bAddress}
            onChangeText={setBAddress}
          />

          <View className="flex-row items-center mb-2">
            <Text className="text-neutral-300 font-bold">Draw Footprint ({bPins.length} pins)</Text>
            <TouchableOpacity
              className="bg-red-900/40 w-6 h-6 rounded-full items-center justify-center ml-2 border border-red-500/50"
              onPress={() => alert("Draw the pins sequentially around the outside wall of the building. Do not mix up the order or criss-cross the lines across the middle of the building. If the lines cross, the detection will fail.")}
            >
              <Text className="text-red-500 font-bold text-xs">?</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-neutral-500 text-xs mb-4">Tap on the map to drop pins sequentially around the perimeter. Minimum 4 pins required.</Text>

          {hasSelfIntersection(bPins) && (
            <View className="bg-red-900/30 p-3 rounded-xl border border-red-500/50 mb-4 flex-row items-center">
              <Text className="text-red-500 mr-2">⚠️</Text>
              <Text className="text-red-400 text-xs flex-1 font-bold">Polygon lines are criss-crossing! Please clear and draw the perimeter sequentially.</Text>
            </View>
          )}

          <View className="bg-neutral-800 rounded-2xl overflow-hidden mb-6 border border-neutral-700 relative" style={{ height: 300 }}>
              {!showAddMap ? (
                <View className="flex-1 justify-center items-center p-6">
                  <ActivityIndicator color="white" />
                  <Text className="text-neutral-400 mt-4 text-xs font-bold">Loading interactive map...</Text>
                </View>
              ) : Platform.OS === 'web' || !MapView ? (
                <View className="flex-1 justify-center items-center p-6">
                  <Text className="text-white text-center mb-4">Interactive Maps are not supported in the Web Simulator.</Text>
                  <Text className="text-neutral-400 text-center text-sm mb-4">Please open this Admin Console on a physical mobile device via Expo Go to use the Pin Drop feature.</Text>
                  <View className="flex-row items-center bg-yellow-900/50 p-4 rounded-xl border border-yellow-700">
                    <Text className="text-yellow-500 font-bold mr-2">⚠️</Text>
                    <Text className="text-yellow-500 text-xs flex-1">Web Fallback: We will generate 4 fake pins for testing.</Text>
                  </View>
                  <TouchableOpacity
                    className={`mt-6 px-6 py-3 rounded-xl ${bPins.length > 0 ? 'bg-green-600' : 'bg-blue-600'}`}
                    onPress={() => {
                      setBPins([
                        { lat: 51.472, lon: -2.124, label: "Top Left" },
                        { lat: 51.471, lon: -2.124, label: "Bottom Left" },
                        { lat: 51.471, lon: -2.123, label: "Bottom Right" },
                        { lat: 51.472, lon: -2.123, label: "Top Right" }
                      ]);
                      showToast("4 Test Pins Generated! You can now save the building.");
                    }}
                  >
                    <Text className="text-white font-bold">{bPins.length > 0 ? "Test Polygon Generated!" : "Generate Test Polygon"}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <MapView
                    ref={addMapRef}
                    style={{ flex: 1 }}
                    onPress={handleMapPress}
                    showsUserLocation={true}
                    showsMyLocationButton={true}

                    initialRegion={{
                      latitude: location ? location.coords.latitude : 51.4717,
                      longitude: location ? location.coords.longitude : -2.1239,
                      latitudeDelta: 0.01,
                      longitudeDelta: 0.01,
                    }}
                  >
                    {bPins.map((pin, i) => (
                      <Marker 
                        key={i} 
                        coordinate={{ latitude: parseFloat(pin.lat as any) || 0, longitude: parseFloat(pin.lon as any) || 0 }} 
                        title={pin.label || `P${i + 1}`}
                        draggable={true}
                        onDragEnd={(e: any) => {
                          const newPins = [...bPins];
                          newPins[i] = { ...newPins[i], lat: parseFloat(e.nativeEvent.coordinate.latitude.toFixed(6)), lon: parseFloat(e.nativeEvent.coordinate.longitude.toFixed(6)) };
                          setBPins(newPins);
                        }}
                      />
                    ))}
                    <Polygon
                      coordinates={bPins.length > 2 ? bPins.map(p => ({ latitude: parseFloat(p.lat as any) || 0, longitude: parseFloat(p.lon as any) || 0 })) : [{ latitude: 0, longitude: 0 }, { latitude: 0.000001, longitude: 0 }, { latitude: 0, longitude: 0.000001 }]}
                      fillColor="rgba(255, 0, 0, 0.3)"
                      strokeColor="rgba(255, 0, 0, 0.8)"
                      strokeWidth={2}
                    />
                  </MapView>
                  <TouchableOpacity
                    className="absolute bottom-4 left-4 bg-neutral-900/80 p-3 rounded-full border border-neutral-700"
                    onPress={() => setBPins([])}
                  >
                    <Text className="text-white text-xs font-bold">Clear Pins</Text>
                  </TouchableOpacity>

                  {!bName && (
                    <View className="absolute inset-0 bg-neutral-900/90 justify-center items-center p-6 z-10">
                      <Text className="text-2xl mb-2">📸</Text>
                      <Text className="text-white font-bold text-center">Enter a Building Name first</Text>
                      <Text className="text-neutral-400 text-center text-xs mt-2">The map drawing tools will unlock once you name the building above.</Text>
                    </View>
                  )}
                </>
              )}
            </View>

          {bPins.length > 0 && (
            <View className="bg-neutral-800 rounded-2xl p-4 border border-neutral-700 mb-6">
              <View className="flex-row items-center mb-2">
                <Text className="text-white font-bold text-lg">Manual Coordinate Editor</Text>
                <TouchableOpacity
                  className="bg-red-900/40 w-6 h-6 rounded-full items-center justify-center ml-2 border border-red-500/50"
                  onPress={() => alert("Ensure the coordinates trace the perimeter sequentially. Mixing the order will cause lines to criss-cross and break the detection math.")}
                >
                  <Text className="text-red-500 font-bold text-xs">?</Text>
                </TouchableOpacity>
              </View>
              <Text className="text-neutral-400 text-sm mb-4">You can manually fine-tune the exact GPS coordinates and labels of your pins below. Useful for fixing inaccurate taps.</Text>

              {bPins && hasSelfIntersection(bPins.map(p => ({ ...p, lat: parseFloat(p.lat as any) || 0, lon: parseFloat(p.lon as any) || 0 }))) && (
                <View className="bg-red-900/30 p-3 rounded-xl border border-red-500/50 mb-4 flex-row items-center">
                  <Text className="text-red-500 mr-2">⚠️</Text>
                  <Text className="text-red-400 text-xs flex-1 font-bold">Polygon lines are criss-crossing! Please adjust the coordinates so they trace sequentially without crossing.</Text>
                </View>
              )}

              <Text className="text-blue-400 text-xs mb-4 font-bold leading-5 bg-blue-900/20 p-2 rounded border border-blue-900/50">ℹ️ Important: Points must be ordered sequentially (either clockwise or counter-clockwise) tracing the outside perimeter of the building.</Text>
              {bPins?.map((p: any, i: number) => (
                <View key={i} className="bg-neutral-800 rounded-xl p-3 mb-3 border border-neutral-700 flex-row">
                  <View className="flex-1">
                    <Text className="text-neutral-500 text-[10px] uppercase font-bold mb-1 ml-1">Label</Text>
                    <TextInput
                      style={{ minWidth: 0, textAlign: 'left' }}
                      className="bg-neutral-900 border border-neutral-700 text-white p-3 rounded-lg text-sm w-full mb-3"
                      value={p.label !== undefined ? p.label : `P${i + 1}`}
                      placeholder={`P${i + 1} Label`}
                      placeholderTextColor="#525252"
                      onChangeText={(val) => {
                        const newPins = [...bPins];
                        newPins[i].label = val;
                        setBPins(newPins);
                      }}
                    />
                    
                    <View className="flex-col">
                      <View className="w-full mb-3">
                        <Text className="text-neutral-500 text-[10px] uppercase font-bold mb-1 ml-1">Latitude ↕️</Text>
                        <TextInput
                          style={{ minWidth: 0, textAlign: 'left' }}
                          className="bg-neutral-900 border border-neutral-700 text-white p-3 rounded-lg text-sm w-full"
                          value={p.lat?.toString()}
                          keyboardType="numeric"
                          onChangeText={(val) => {
                            const newPins = [...bPins];
                            newPins[i].lat = val as any;
                            setBPins(newPins);
                          }}
                        />
                      </View>
                      
                      <View className="w-full">
                        <Text className="text-neutral-500 text-[10px] uppercase font-bold mb-1 ml-1">Longitude ↔️</Text>
                        <TextInput
                          style={{ minWidth: 0, textAlign: 'left' }}
                          className="bg-neutral-900 border border-neutral-700 text-white p-3 rounded-lg text-sm w-full"
                          value={p.lon?.toString()}
                          keyboardType="numeric"
                          onChangeText={(val) => {
                            const newPins = [...bPins];
                            newPins[i].lon = val as any;
                            setBPins(newPins);
                          }}
                        />
                      </View>
                    </View>
                  </View>

                  <View className="ml-3 pl-3 border-l border-neutral-700 justify-between items-center w-12 py-1">
                    <TouchableOpacity
                      className={`w-8 h-8 rounded-full items-center justify-center ${i === 0 ? 'bg-neutral-800 opacity-50' : 'bg-neutral-700'}`}
                      onPress={() => {
                        if (i === 0) return;
                        const newPins = [...bPins];
                        const temp = newPins[i - 1];
                        newPins[i - 1] = newPins[i];
                        newPins[i] = temp;
                        setBPins(newPins);
                      }}
                      disabled={i === 0}
                    >
                      <Text className="text-white text-xs">▲</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      className="w-8 h-8 rounded-full items-center justify-center bg-red-900/40 border border-red-500/50"
                      onPress={() => {
                        const newPins = bPins.filter((_: any, index: number) => index !== i);
                        setBPins(newPins);
                      }}
                    >
                      <Text className="text-red-500 font-bold text-sm">✕</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      className={`w-8 h-8 rounded-full items-center justify-center ${i === bPins.length - 1 ? 'bg-neutral-800 opacity-50' : 'bg-neutral-700'}`}
                      onPress={() => {
                        if (i === bPins.length - 1) return;
                        const newPins = [...bPins];
                        const temp = newPins[i + 1];
                        newPins[i + 1] = newPins[i];
                        newPins[i] = temp;
                        setBPins(newPins);
                      }}
                      disabled={i === bPins.length - 1}
                    >
                      <Text className="text-white text-xs">▼</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <View className="flex-row justify-between mt-4">
                <TouchableOpacity
                  className="bg-neutral-700 px-4 py-2 rounded-lg"
                  onPress={() => {
                    const newPins = [...bPins, { lat: 0, lon: 0 }];
                    setBPins(newPins);
                  }}
                >
                  <Text className="text-white font-bold text-sm">+ Add Pin</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setBPins([])} className="bg-red-900/40 px-3 py-2 rounded-lg border border-red-500/50">
                  <Text className="text-red-400 text-xs">Clear All</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text className="text-neutral-300 font-bold mb-2">Master Plan Image</Text>
          <TouchableOpacity
            className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 items-center mb-6"
            onPress={() => {
              pickOrTakeImage((uri, mimeType) => {
                setBImageUri(uri);
                if (mimeType) setBImageMimeType(mimeType);
              });
            }}
          >
            {bImageUri ? (
              <View className="w-full relative">
                <Image source={{ uri: bImageUri }} className="w-full h-40 rounded-lg mb-2 bg-neutral-900" resizeMode="cover" />
                {Platform.OS === 'web' && (
                  <View className="absolute inset-0 items-center justify-center bg-black/60 rounded-lg" style={{ pointerEvents: 'none' }}>
                    <Text className="text-4xl mb-2">✅</Text>
                    <Text className="text-white font-bold text-center">Image Selected</Text>
                    <Text className="text-white/70 text-xs text-center px-4 mt-1">(Web preview may appear blank, but the file is attached)</Text>
                  </View>
                )}
              </View>
            ) : (
              <View className="items-center py-6">
                <Text className="text-3xl mb-2">📸</Text>
                <Text className="text-white font-bold">Select Master Plan</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className={`py-4 rounded-xl items-center mb-8 ${bName ? 'bg-green-600' : 'bg-neutral-800'}`}
            onPress={handleSaveBuilding}
            disabled={!bName || isUploading}
          >
            {isUploading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-lg">Save Building</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      {/* Manage Building Modal */}
      <Modal visible={!!selectedBuilding} animationType="slide" presentationStyle="pageSheet">
        {selectedBuilding && (
          <ScrollView className="flex-1 bg-neutral-900 pt-12 px-6" contentContainerStyle={{ paddingBottom: 120 }}>
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-extrabold text-white">Manage Building</Text>
              <TouchableOpacity onPress={() => { setSelectedBuilding(null); setEditingPins(null); }} className="bg-neutral-800 p-2 rounded-full border border-neutral-700">
                <Text className="text-white font-bold">✕</Text>
              </TouchableOpacity>
            </View>

            {(() => {
              const isActive = selectedBuilding?.polygon && selectedBuilding.polygon.length >= 3 &&
                selectedBuilding.masterPlanId &&
                selectedBuilding.imageCalibrationPoints && selectedBuilding.imageCalibrationPoints.length >= 3 &&
                selectedBuilding.gridPaths && selectedBuilding.gridPaths.some((n: any) => n.isExit);
              if (!isActive) {
                return (
                  <View className="bg-red-900/30 p-4 rounded-xl border border-red-500/50 mb-6 flex-row items-center">
                    <Text className="text-red-500 mr-3 text-2xl">⚠️</Text>
                    <View className="flex-1">
                      <Text className="text-red-500 font-bold mb-1">Building Not Active</Text>
                      <Text className="text-red-400 text-xs">This building will not be pushed to guests until the Polygon, Master Plan, Calibration, and Safe Routes are fully set.</Text>
                    </View>
                  </View>
                )
              } else {
                return (
                  <View className="bg-green-900/30 p-4 rounded-xl border border-green-700/50 mb-6 flex-row items-center">
                    <Text className="text-green-500 mr-3 text-2xl">✅</Text>
                    <View className="flex-1">
                      <Text className="text-green-500 font-bold mb-1">Building is Active</Text>
                      <Text className="text-green-400 text-xs">This building is fully configured and is actively being pushed to guests.</Text>
                    </View>
                  </View>
                )
              }
            })()}

            <View className="bg-neutral-800 p-6 rounded-2xl border border-neutral-700 mb-6">
              <Text className="text-white font-bold mb-2">Building Name</Text>
              <TextInput
                className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-white mb-4"
                value={editBName}
                onChangeText={setEditBName}
                placeholder="Building Name"
                placeholderTextColor="#525252"
              />
              <Text className="text-white font-bold mb-2">Site Name (Optional)</Text>
              <TextInput
                className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-white mb-4"
                value={editBSite}
                onChangeText={setEditBSite}
                placeholder="Site Name"
                placeholderTextColor="#525252"
              />
              <Text className="text-white font-bold mb-2">Address (Optional)</Text>
              <TextInput
                className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-white mb-4"
                value={editBAddress}
                onChangeText={setEditBAddress}
                placeholder="Address"
                placeholderTextColor="#525252"
              />
              <TouchableOpacity
                className={`py-3 rounded-xl items-center ${editBName !== selectedBuilding.name || editBSite !== (selectedBuilding.siteName || "") || editBAddress !== selectedBuilding.address ? 'bg-blue-600' : 'bg-neutral-700'}`}
                disabled={editBName === selectedBuilding.name && editBSite === (selectedBuilding.siteName || "") && (editBAddress === selectedBuilding.address || (editBAddress === "" && selectedBuilding.address === "No Address Provided"))}
                onPress={async () => {
                  try {
                    const finalAddress = editBAddress || "No Address Provided";
                    await updateBuildingInfo({
                      clerkId: user?.id || "",
                      buildingId: selectedBuilding._id,
                      name: editBName,
                      ...(editBSite ? { siteName: editBSite } : { siteName: "" }),
                      address: finalAddress,
                    });
                    setSelectedBuilding({ ...selectedBuilding, name: editBName, siteName: editBSite, address: finalAddress });
                    showToast("Building details updated!");
                  } catch (e) {
                    showToast("Error updating building", "error");
                  }
                }}
              >
                <Text className="text-white font-bold">Save Details</Text>
              </TouchableOpacity>
            </View>

            <Text className="text-white font-bold text-lg mb-4">Polygon Footprint</Text>
            <View className="bg-neutral-800 rounded-2xl overflow-hidden mb-6 border border-neutral-700 relative" style={{ height: 300 }}>
                {!showEditMap ? (
                  <View className="flex-1 justify-center items-center p-6">
                    <ActivityIndicator color="white" />
                    <Text className="text-neutral-400 mt-4 text-xs font-bold">Loading interactive map...</Text>
                  </View>
                ) : Platform.OS === 'web' || !MapView ? (
                <View className="flex-1 justify-center items-center p-6">
                  <Text className="text-white text-center mb-4">Interactive Maps are not supported in the Web Simulator.</Text>
                  <Text className="text-neutral-400 text-center text-sm mb-4">Please open this Admin Console on a physical mobile device via Expo Go to view or edit the Polygon pins.</Text>
                  <View className="flex-row items-center bg-green-900/50 p-4 rounded-xl border border-green-700 mb-4">
                    <Text className="text-green-500 font-bold mr-2">✅</Text>
                    <Text className="text-green-500 text-xs flex-1">This building has {selectedBuilding.polygon?.length || 0} pins saved.</Text>
                  </View>
                  <TouchableOpacity
                    className={`px-6 py-3 rounded-xl ${editingPins && editingPins.length > 0 ? 'bg-green-600' : 'bg-blue-600'}`}
                    onPress={() => {
                      setEditingPins([
                        { lat: 51.472, lon: -2.124, label: "Top Left" },
                        { lat: 51.471, lon: -2.124, label: "Bottom Left" },
                        { lat: 51.471, lon: -2.123, label: "Bottom Right" },
                        { lat: 51.472, lon: -2.123, label: "Top Right" }
                      ]);
                      showToast("4 Test Pins Generated! You can now update the building footprint.");
                    }}
                  >
                    <Text className="text-white font-bold">{editingPins && editingPins.length > 0 ? "Test Polygon Generated!" : "Generate Test Polygon"}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <MapView
                    ref={editMapRef}
                    style={{ flex: 1 }}
                    showsUserLocation={true}
                    showsMyLocationButton={true}
                    onMapReady={() => {
                      if (location && (!selectedBuilding?.polygon || selectedBuilding.polygon.length === 0)) {
                        editMapRef.current?.animateToRegion({
                          latitude: location.coords.latitude,
                          longitude: location.coords.longitude,
                          latitudeDelta: 0.005,
                          longitudeDelta: 0.005,
                        }, 1000);
                      }
                    }}
                    onPress={(e: any) => {
                      if (e.nativeEvent.coordinate && editingPins) {
                        setEditingPins([...editingPins, { lat: parseFloat(e.nativeEvent.coordinate.latitude.toFixed(6)), lon: parseFloat(e.nativeEvent.coordinate.longitude.toFixed(6)) }]);
                      }
                    }}
                    initialRegion={
                      selectedBuilding.polygon && selectedBuilding.polygon.length > 0
                        ? {
                          latitude: selectedBuilding.polygon[0].lat,
                          longitude: selectedBuilding.polygon[0].lon,
                          latitudeDelta: 0.005,
                          longitudeDelta: 0.005,
                        }
                        : {
                          latitude: location ? location.coords.latitude : 51.4717,
                          longitude: location ? location.coords.longitude : -2.1239,
                          latitudeDelta: 0.01,
                          longitudeDelta: 0.01,
                        }
                    }
                  >
                    {editingPins?.map((pin: any, i: number) => (
                      <Marker 
                        key={i} 
                        coordinate={{ latitude: parseFloat(pin.lat as any) || 0, longitude: parseFloat(pin.lon as any) || 0 }} 
                        title={pin.label || `P${i + 1}`}
                        draggable={true}
                        onDragEnd={(e: any) => {
                          const newPins = [...editingPins];
                          newPins[i] = { ...newPins[i], lat: parseFloat(e.nativeEvent.coordinate.latitude.toFixed(6)), lon: parseFloat(e.nativeEvent.coordinate.longitude.toFixed(6)) };
                          setEditingPins(newPins);
                        }}
                      />
                    ))}
                    <Polygon
                      coordinates={editingPins && editingPins.length > 2 ? editingPins.map((p: any) => ({ latitude: parseFloat(p.lat as any) || 0, longitude: parseFloat(p.lon as any) || 0 })) : [{ latitude: 0, longitude: 0 }, { latitude: 0.000001, longitude: 0 }, { latitude: 0, longitude: 0.000001 }]}
                      fillColor="rgba(255, 0, 0, 0.3)"
                      strokeColor="rgba(255, 0, 0, 0.8)"
                      strokeWidth={2}
                    />
                  </MapView>
                  <TouchableOpacity
                    className="absolute bottom-4 left-4 bg-neutral-900/80 p-3 rounded-full border border-neutral-700"
                    onPress={() => setEditingPins([])}
                  >
                    <Text className="text-white text-xs font-bold">Clear Pins</Text>
                  </TouchableOpacity>
                  {editingPins && editingPins !== selectedBuilding.polygon && editingPins.length >= 3 && (
                    <TouchableOpacity
                      className="absolute bottom-4 right-4 bg-green-600 p-3 rounded-full"
                      onPress={async () => {
                        try {
                          await updateBuildingPolygon({
                            clerkId: user?.id || "",
                            buildingId: selectedBuilding._id,
                            polygon: editingPins.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) }))
                          });
                          setSelectedBuilding({ ...selectedBuilding, polygon: editingPins.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) })) });
                          showToast("Polygon updated successfully!");
                        } catch (e) {
                          showToast("Error saving polygon", "error");
                        }
                      }}
                    >
                      <Text className="text-white text-xs font-bold">Save New Polygon</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>

            {editingPins && editingPins.length > 0 && (
              <View className="bg-neutral-800 rounded-xl p-4 mb-6 border border-neutral-700">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-white font-bold">Selected Pins ({editingPins.length})</Text>
                  <TouchableOpacity onPress={() => setEditingPins(editingPins.slice(0, -1))} className="bg-red-900/40 px-3 py-1 rounded-full border border-red-500/50">
                    <Text className="text-red-400 text-xs">Undo Last Pin</Text>
                  </TouchableOpacity>
                </View>
                {editingPins.map((pin: any, i: number) => (
                  <View key={i} className="flex-row justify-between items-center py-2 border-b border-neutral-700/50">
                    <Text className="text-neutral-300">Pin {i + 1}</Text>
                    <Text className="text-neutral-400 text-xs">
                      {Number(pin.lat).toFixed(6)}, {Number(pin.lon).toFixed(6)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View className="flex-row items-center mb-2">
              <Text className="text-white font-bold text-lg">Manual Coordinate Editor</Text>
              <TouchableOpacity
                className="bg-red-900/40 w-6 h-6 rounded-full items-center justify-center ml-2 border border-red-500/50"
                onPress={() => alert("Ensure the coordinates trace the perimeter sequentially. Mixing the order will cause lines to criss-cross and break the detection math.")}
              >
                <Text className="text-red-500 font-bold text-xs">?</Text>
              </TouchableOpacity>
            </View>
            <Text className="text-neutral-400 text-sm mb-4">You can manually fine-tune the exact GPS coordinates of your pins below. Useful for fixing inaccurate taps.</Text>

            {editingPins && hasSelfIntersection(editingPins) && (
              <View className="bg-red-900/30 p-3 rounded-xl border border-red-500/50 mb-4 flex-row items-center">
                <Text className="text-red-500 mr-2">⚠️</Text>
                <Text className="text-red-400 text-xs flex-1 font-bold">Polygon lines are criss-crossing! Please adjust the coordinates so they trace sequentially without crossing.</Text>
              </View>
            )}

            <View className="bg-neutral-800 rounded-2xl p-4 border border-neutral-700 mb-6">
              <Text className="text-blue-400 text-xs mb-4 font-bold leading-5 bg-blue-900/20 p-2 rounded border border-blue-900/50">ℹ️ Important: Points must be ordered sequentially (either clockwise or counter-clockwise) tracing the outside perimeter of the building.</Text>
              {editingPins?.map((p: any, i: number) => (
                <View key={i} className="bg-neutral-800 rounded-xl p-3 mb-3 border border-neutral-700 flex-row">
                  <View className="flex-1">
                    <Text className="text-neutral-500 text-[10px] uppercase font-bold mb-1 ml-1">Label</Text>
                    <TextInput
                      style={{ minWidth: 0, textAlign: 'left' }}
                      className="bg-neutral-900 border border-neutral-700 text-white p-3 rounded-lg text-sm w-full mb-3"
                      value={p.label !== undefined ? p.label : `P${i + 1}`}
                      placeholder={`P${i + 1} Label`}
                      placeholderTextColor="#525252"
                      onChangeText={(val) => {
                        const newPins = [...(editingPins || [])];
                        newPins[i].label = val;
                        setEditingPins(newPins);
                      }}
                    />
                    
                    <View className="flex-col">
                      <View className="w-full mb-3">
                        <Text className="text-neutral-500 text-[10px] uppercase font-bold mb-1 ml-1">Latitude ↕️</Text>
                        <TextInput
                          style={{ minWidth: 0, textAlign: 'left' }}
                          className="bg-neutral-900 border border-neutral-700 text-white p-3 rounded-lg text-sm w-full"
                          value={p.lat?.toString()}
                          keyboardType="numeric"
                          onChangeText={(val) => {
                            const newPins = [...(editingPins || [])];
                            newPins[i].lat = val as any;
                            setEditingPins(newPins);
                          }}
                        />
                      </View>
                      
                      <View className="w-full">
                        <Text className="text-neutral-500 text-[10px] uppercase font-bold mb-1 ml-1">Longitude ↔️</Text>
                        <TextInput
                          style={{ minWidth: 0, textAlign: 'left' }}
                          className="bg-neutral-900 border border-neutral-700 text-white p-3 rounded-lg text-sm w-full"
                          value={p.lon?.toString()}
                          keyboardType="numeric"
                          onChangeText={(val) => {
                            const newPins = [...(editingPins || [])];
                            newPins[i].lon = val as any;
                            setEditingPins(newPins);
                          }}
                        />
                      </View>
                    </View>
                  </View>

                  <View className="ml-3 pl-3 border-l border-neutral-700 justify-between items-center w-12 py-1">
                    <TouchableOpacity
                      className={`w-8 h-8 rounded-full items-center justify-center ${i === 0 ? 'bg-neutral-800 opacity-50' : 'bg-neutral-700'}`}
                      onPress={() => {
                        if (i === 0) return;
                        const newPins = [...editingPins];
                        const temp = newPins[i - 1];
                        newPins[i - 1] = newPins[i];
                        newPins[i] = temp;
                        setEditingPins(newPins);
                      }}
                      disabled={i === 0}
                    >
                      <Text className="text-white text-xs">▲</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      className="w-8 h-8 rounded-full items-center justify-center bg-red-900/40 border border-red-500/50"
                      onPress={() => {
                        const newPins = editingPins.filter((_: any, index: number) => index !== i);
                        setEditingPins(newPins);
                      }}
                    >
                      <Text className="text-red-500 font-bold text-sm">✕</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      className={`w-8 h-8 rounded-full items-center justify-center ${i === editingPins.length - 1 ? 'bg-neutral-800 opacity-50' : 'bg-neutral-700'}`}
                      onPress={() => {
                        if (i === editingPins.length - 1) return;
                        const newPins = [...editingPins];
                        const temp = newPins[i + 1];
                        newPins[i + 1] = newPins[i];
                        newPins[i] = temp;
                        setEditingPins(newPins);
                      }}
                      disabled={i === editingPins.length - 1}
                    >
                      <Text className="text-white text-xs">▼</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <View className="flex-row justify-between mt-4">
                <TouchableOpacity
                  className="bg-neutral-700 px-4 py-2 rounded-lg"
                  onPress={() => {
                    const newPins = [...(editingPins || []), { lat: 0, lon: 0 }];
                    setEditingPins(newPins);
                  }}
                >
                  <Text className="text-white font-bold text-sm">+ Add Pin</Text>
                </TouchableOpacity>

                {editingPins && editingPins.length >= 3 && !hasSelfIntersection(editingPins.map((p: any) => ({ ...p, lat: parseFloat(p.lat) || 0, lon: parseFloat(p.lon) || 0 }))) && (
                  <TouchableOpacity
                    className="bg-green-600 px-6 py-3 rounded-lg"
                    onPress={async () => {
                      try {
                        const parsedPins = editingPins.map((p: any) => ({ ...p, lat: parseFloat(p.lat) || 0, lon: parseFloat(p.lon) || 0 }));
                        await updateBuildingPolygon({
                          clerkId: user?.id || "",
                          buildingId: selectedBuilding._id,
                          polygon: parsedPins
                        });
                        setSelectedBuilding({ ...selectedBuilding, polygon: parsedPins });
                        showToast("Coordinates manually updated successfully!");
                      } catch (e) {
                        showToast("Error saving polygon", "error");
                      }
                    }}
                  >
                    <Text className="text-white font-bold text-sm">Save Changes</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Text className="text-white font-bold text-lg mb-4">Master Floor Plan</Text>
            {selectedBuilding.masterPlanUrl ? (
              <View className="bg-neutral-800 border border-neutral-700 p-4 rounded-2xl items-center mb-6">
                <Image
                  source={{ uri: selectedBuilding.masterPlanUrl }}
                  className="w-full h-48 rounded-xl mb-4"
                  resizeMode="contain"
                />
                <Text className="text-green-400 font-bold text-lg mb-1">✓ Floor Plan Active</Text>
                <Text className="text-neutral-400 text-xs text-center mb-4">This map will be pushed to Guests entering the footprint.</Text>

                <TouchableOpacity
                  className="bg-neutral-700 border border-neutral-600 px-6 py-3 rounded-xl flex-row items-center w-full justify-center"
                  onPress={() => handleUploadImage(selectedBuilding._id)}
                  disabled={isUploading}
                >
                  {isUploading ? <ActivityIndicator color="white" className="mr-2" /> : <Text className="mr-2">🔄</Text>}
                  <Text className="text-white font-bold">{isUploading ? "Uploading..." : "Replace Floor Plan"}</Text>
                </TouchableOpacity>

                <View className="w-full mt-4">
                  <TouchableOpacity
                    className="w-full bg-blue-600 py-4 rounded-xl items-center flex-row justify-center shadow-lg"
                    onPress={() => {
                      setCalibPoints(selectedBuilding.imageCalibrationPoints || []);
                      setGridPaths(selectedBuilding.gridPaths || []);
                      setMapEditorStep(1);
                      setStep1PanMode(true);
                      setGridPaintMode("pan");
                      setStep1Zoom(1);
                      setStep1PanOffset({ x: 0, y: 0 });
                      setIsMapEditorOpen(true);
                    }}
                  >
                    <Text className="text-white font-extrabold text-lg uppercase tracking-wider">🗺️ Open Map Editor</Text>
                  </TouchableOpacity>
                  {selectedBuilding.imageCalibrationPoints?.length !== selectedBuilding.polygon?.length && (
                    <Text className="text-orange-400 text-xs text-center mt-2">⚠️ Calibration required before routing.</Text>
                  )}
                </View>
              </View>
            ) : (
              <View className="bg-neutral-800 border border-neutral-700 p-6 rounded-2xl items-center mb-6">
                <Text className="text-neutral-400 text-center mb-4">No floor plan image uploaded yet. Guests will not see a map.</Text>
                <TouchableOpacity
                  className="bg-amber-600 px-6 py-3 rounded-xl flex-row items-center"
                  onPress={() => handleUploadImage(selectedBuilding._id)}
                  disabled={isUploading}
                >
                  {isUploading ? <ActivityIndicator color="white" className="mr-2" /> : <Text className="mr-2">📸</Text>}
                  <Text className="text-white font-bold">{isUploading ? "Uploading..." : "Upload Floor Plan"}</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              className="bg-red-900/30 border border-red-700 py-4 rounded-xl items-center mb-12"
              onPress={() => setShowDeleteConfirm(true)}
            >
              <Text className="text-red-400 font-bold">Delete Building</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </Modal>
      {/* Delete Confirmation Modal */}
      <Modal visible={showDeleteConfirm} animationType="fade" transparent>
        <View className="flex-1 bg-black/80 justify-center items-center px-6">
          <View className="bg-neutral-900 border border-neutral-700 p-6 rounded-3xl w-full max-w-sm">
            <Text className="text-xl font-bold text-white mb-2">Delete Building</Text>
            <Text className="text-neutral-400 mb-6">Are you sure you want to delete {selectedBuilding?.name}? This action cannot be undone and will permanently remove all associated maps and layouts.</Text>

            <View className="flex-row space-x-4">
              <TouchableOpacity
                className="flex-1 bg-neutral-800 py-4 rounded-xl items-center border border-neutral-700 mr-2"
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text className="text-white font-bold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 bg-red-600 py-4 rounded-xl items-center border border-red-500"
                onPress={async () => {
                  try {
                    await deleteBuilding({ clerkId: user?.id || "", buildingId: selectedBuilding._id });
                    setShowDeleteConfirm(false);
                    setSelectedBuilding(null);
                    showToast("Building deleted successfully");
                  } catch (e) {
                    setShowDeleteConfirm(false);
                    showToast("Failed to delete building", "error");
                  }
                }}
              >
                <Text className="text-white font-bold text-lg">Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>



      {/* Unified Map Editor Modal */}
      <Modal visible={isMapEditorOpen} animationType="slide">
        <View className="flex-1 bg-neutral-900 pt-6 px-4">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-xl font-bold text-white">{isLocatingUser ? "Locate Trapped User" : "Manage Map Layout"}</Text>
            <TouchableOpacity onPress={() => {
              setIsMapEditorOpen(false);
              if (isLocatingUser) {
                setSelectedBuilding(null);
              }
              setIsLocatingUser(false);
            }} className="bg-neutral-800 p-2 rounded-full border border-neutral-700">
              <Text className="text-white font-bold">✕</Text>
            </TouchableOpacity>
          </View>

          {isLocatingUser ? (() => {
            const initialTarget = editingPins?.[0];
            const liveUser = locatingRollCall.find((r: any) => r.userName === initialTarget?.label);
            const target = initialTarget ? {
              label: initialTarget.label,
              lat: liveUser?.lastLat ?? initialTarget.lat,
              lon: liveUser?.lastLon ?? initialTarget.lon
            } : undefined;
            let isInside = false;
            if (selectedBuilding?.polygon && target) {
              const poly = selectedBuilding.polygon;
              for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const xi = poly[i].lon, yi = poly[i].lat;
                const xj = poly[j].lon, yj = poly[j].lat;
                const intersect = ((yi > target.lat) !== (yj > target.lat)) && (target.lon < (xj - xi) * (target.lat - yi) / (yj - yi) + xi);
                if (intersect) isInside = !isInside;
              }
            }

            return (
              <View className="flex-1">
                <View className="bg-red-600 py-3 px-4 rounded-xl mb-4 shadow-[0_0_10px_rgba(220,38,38,0.5)]">
                  <Text className="text-white font-black text-xl md:text-2xl text-center uppercase tracking-wider">🚨 Tracking: {target?.label} 🚨</Text>
                </View>

                {!isInside ? (
                  <View className="bg-neutral-800 rounded-xl mb-6 w-full items-center justify-center border border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]" style={{ height: '70%' }}>
                    <Text className="text-red-500 font-black text-2xl mb-2 text-center">OUT OF BOUNDS</Text>
                    <Text className="text-white font-bold text-center text-lg px-8">User is no longer inside the building!</Text>
                    <Text className="text-red-300 text-center mt-4 px-8">They may have exited safely without pressing the 'I am Safe' button.</Text>
                  </View>
                ) : (
                  <View
                    className="bg-neutral-800 rounded-xl overflow-hidden mb-6 w-full"
                    style={{ height: '70%' }}
                    onLayout={(e) => setImgLayout({ w: Math.max(1, e.nativeEvent.layout.width), h: Math.max(1, e.nativeEvent.layout.height) })}
                  >
                    {selectedBuilding?.masterPlanUrl && (() => {
                      const mapTransform = getMapTransform();
                      return (
                        <View className="flex-1 justify-center items-center relative">
                          <View
                            style={{
                              width: mapTransform.maskW,
                              height: mapTransform.maskH,
                              overflow: 'hidden',
                              position: 'relative',
                            }}
                          >
                            <View
                              style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                width: imgLayout.w,
                                height: imgLayout.h,
                                transform: [
                                  { scale: mapTransform.scale },
                                  { translateX: mapTransform.translateX },
                                  { translateY: mapTransform.translateY }
                                ]
                              }}
                            >
                              <Image
                                source={{ uri: selectedBuilding.masterPlanUrl }}
                                className="w-full h-full opacity-70"
                                resizeMode="contain"
                                onLoad={(e) => setImageAspectRatio(e.nativeEvent.source.width / Math.max(1, e.nativeEvent.source.height))}
                              />
                              {(() => {
                                const initialTarget = editingPins?.[0];
                                const liveUser = locatingRollCall.find((r: any) => r.userName === initialTarget?.label);
                                const target = initialTarget ? {
                                  label: initialTarget.label,
                                  lat: liveUser?.lastLat ?? initialTarget.lat,
                                  lon: liveUser?.lastLon ?? initialTarget.lon
                                } : undefined;
                                if (!selectedBuilding || !selectedBuilding.polygon || !selectedBuilding.imageCalibrationPoints || selectedBuilding.polygon.length < 3 || selectedBuilding.imageCalibrationPoints.length < 3 || !target) {
                                  return (
                                    <View className="absolute inset-0 items-center justify-center pointer-events-none">
                                      <View className="w-16 h-16 rounded-full bg-red-600/30 items-center justify-center animate-ping">
                                        <Text className="text-5xl">🆘</Text>
                                      </View>
                                    </View>
                                  );
                                }

                                const poly = selectedBuilding.polygon;
                                const rawImgPts = selectedBuilding.imageCalibrationPoints;
                                const isLegacyPixels = rawImgPts[0].x > 2;
                                const imgPts = rawImgPts.map((p: any) => ({
                                  x: isLegacyPixels ? p.x / Math.max(1, imgLayout.w) : p.x,
                                  y: isLegacyPixels ? p.y / Math.max(1, imgLayout.h) : p.y
                                }));

                                const minLat = Math.min(...poly.map((p: any) => p.lat));
                                const maxLat = Math.max(...poly.map((p: any) => p.lat));
                                const minLon = Math.min(...poly.map((p: any) => p.lon));
                                const maxLon = Math.max(...poly.map((p: any) => p.lon));

                                let y_pct = (maxLat - target.lat) / (maxLat - minLat || 1);
                                let x_pct = (target.lon - minLon) / (maxLon - minLon || 1);

                                if (imgPts && imgPts.length >= 4) {
                                  const minCX = Math.min(...imgPts.map((c: any) => c.x));
                                  const maxCX = Math.max(...imgPts.map((c: any) => c.x));
                                  const minCY = Math.min(...imgPts.map((c: any) => c.y));
                                  const maxCY = Math.max(...imgPts.map((c: any) => c.y));

                                  x_pct = minCX + x_pct * (maxCX - minCX);
                                  y_pct = minCY + y_pct * (maxCY - minCY);
                                }

                                const bounds = getRenderedImageBounds();
                                const px = bounds.offsetX + x_pct * bounds.renderW;
                                const py = bounds.offsetY + y_pct * bounds.renderH;

                                return (
                                  <View
                                    className="absolute items-center justify-center pointer-events-none"
                                    style={{ left: px - 20, top: py - 20, width: 40, height: 40 }}
                                  >
                                    <View className="absolute inset-0 rounded-full bg-red-600/30 animate-ping" />
                                    <Text className="text-red-500 font-bold text-3xl z-10" style={{ transform: [{ scale: 1 / mapTransform.scale }] }}>+</Text>
                                    <Text className="text-xl z-20 absolute top-8" style={{ transform: [{ scale: 1 / mapTransform.scale }] }}>🆘</Text>
                                  </View>
                                );
                              })()}
                            </View>
                          </View>
                        </View>
                      );
                    })()}
                  </View>
                )}
                <TouchableOpacity
                  className="bg-red-600 py-4 rounded-xl items-center border border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.5)]"
                  onPress={async () => {
                    import('react-native').then(rn => {
                      if (rn.Share) rn.Share.share({ message: `EMERGENCY! User ${editingPins?.[0]?.label} is trapped at coordinates: ${editingPins?.[0]?.lat}, ${editingPins?.[0]?.lon} in ${selectedBuilding?.name}. Dispatch help immediately!` });
                    });
                  }}
                >
                  <Text className="text-white font-bold text-xl tracking-widest">🚨 SHARE TO FIRE BRIGADE</Text>
                </TouchableOpacity>
              </View>
            );
          })() : (
            <>
              {/* Tabs */}
              <View className="flex-row border-b border-neutral-700 mb-4 pb-2">
                <TouchableOpacity
                  className={`flex-1 py-2 rounded-t-lg mx-1 flex-row items-center justify-center ${mapEditorStep === 1 ? 'bg-blue-600' : 'bg-neutral-800'}`}
                  onPress={() => {
                    setMapEditorStep(1);
                    setStep1PanMode(true);
                    setStep1Zoom(1);
                    setStep1PanOffset({ x: 0, y: 0 });
                  }}
                  disabled={!selectedBuilding}
                >
                  <Text className={`font-bold text-center w-full px-1 ${mapEditorStep === 1 ? 'text-white' : 'text-neutral-400'}`} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.5}>Step 1: Calibrate</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`flex-1 py-2 rounded-t-lg mx-1 flex-row items-center justify-center ${mapEditorStep === 2 ? 'bg-blue-600' : 'bg-neutral-800'}`}
                  onPress={() => {
                    performAutoZoom();
                    setMapEditorStep(2);
                  }}
                  disabled={!selectedBuilding}
                >
                  <Text className={`font-bold text-center w-full px-1 ${mapEditorStep === 2 ? 'text-white' : 'text-neutral-400'}`} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.5}>Step 2: Safe Routes</Text>
                </TouchableOpacity>
              </View>


                <ScrollView className="flex-1" style={{ display: mapEditorStep === 1 ? 'flex' : 'none' }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
                  <Text className="text-neutral-400 text-lg mb-4">Select a GPS pin from the list below, then tap its matching corner on the floor plan.</Text>

                  <View className="flex-row flex-wrap mb-4 justify-center">
                    {selectedBuilding?.polygon?.map((p: any, i: number) => {
                      return (
                        <TouchableOpacity
                          key={i}
                          className={`px-3 py-2 rounded-lg border mr-2 mb-2 ${activeCalibIdx === i ? 'bg-blue-600 border-blue-400' : 'bg-neutral-800 border-neutral-600'}`}
                          onPress={() => {
                            if (activeCalibIdx === i) {
                              setActiveCalibIdx(-1);
                            } else {
                              setActiveCalibIdx(i);
                              setStep1PanMode(false);
                            }
                          }}
                        >
                          <Text className="text-white font-bold text-base">{p.label || `P${i + 1}`}</Text>
                          {calibPoints[i] && <Text className="text-green-400 text-[10px] mt-1 font-bold">✓ Placed</Text>}
                        </TouchableOpacity>
                      )
                    })}
                  </View>

                  {/* Step 1 Toolbar */}
                  <View className="flex-row space-x-2 mb-2">
                    <TouchableOpacity
                      className={`flex-1 py-3 rounded-xl items-center border-2 ${!step1PanMode ? 'bg-blue-600 border-blue-400' : 'bg-neutral-800 border-neutral-700'}`}
                      onPress={() => setStep1PanMode(false)}
                    >
                      <Text className="text-white font-bold text-lg">📍 Place Pin</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className={`flex-1 py-3 rounded-xl items-center border-2 ${step1PanMode ? 'bg-amber-600 border-amber-400' : 'bg-neutral-800 border-neutral-700'}`}
                      onPress={() => setStep1PanMode(true)}
                    >
                      <Text className="text-white font-bold text-lg">✋ Pan</Text>
                    </TouchableOpacity>
                  </View>

                  <View className="flex-row justify-end space-x-2 mb-4">
                    <Text className="text-white my-auto font-bold mr-2">Zoom:</Text>
                    <TouchableOpacity
                      className="bg-neutral-700 p-2 rounded-lg"
                      onPress={() => {
                        setStep1Zoom(Math.max(1, step1Zoom - 0.5));
                        setStep1PanOffset({ x: 0, y: 0 });
                      }}
                    >
                      <MaterialCommunityIcons name="minus" size={24} color="white" />
                    </TouchableOpacity>
                    <Text className="text-white my-auto font-bold">{Math.round(step1Zoom * 100)}%</Text>
                    <TouchableOpacity
                      className="bg-neutral-700 p-2 rounded-lg"
                      onPress={() => {
                        const newZoom = Math.min(5, step1Zoom + 0.5);
                        setStep1Zoom(newZoom);
                        if (activeCalibIdx !== -1 && calibPoints[activeCalibIdx]) {
                          const p = calibPoints[activeCalibIdx];
                          const bounds = getRenderedImageBounds();
                          const px = p.x > 2 ? p.x : bounds.offsetX + p.x * bounds.renderW;
                          const py = p.x > 2 ? p.y : bounds.offsetY + p.y * bounds.renderH;
                          setStep1PanOffset({
                            x: (imgLayout.w / 2 - px) * newZoom,
                            y: (imgLayout.h / 2 - py) * newZoom
                          });
                        } else {
                          setStep1PanOffset({ x: 0, y: 0 });
                        }
                      }}
                    >
                      <MaterialCommunityIcons name="plus" size={24} color="white" />
                    </TouchableOpacity>
                  </View>

                  <View
                    ref={step1MapRef}
                    className="bg-neutral-800 rounded-xl overflow-hidden mb-6 w-full justify-center items-center relative"
                    style={{ height: getDynamicMapHeight() }}
                    onLayout={(e) => {
                      setImgLayout({ w: Math.max(1, e.nativeEvent.layout.width), h: Math.max(1, e.nativeEvent.layout.height) });
                      if (Platform.OS === 'web' && step1MapRef.current) {
                        const rect = step1MapRef.current.getBoundingClientRect();
                        setStep1MapPos({ x: rect.left + window.scrollX, y: rect.top + window.scrollY });
                      } else if (step1MapRef.current) {
                        step1MapRef.current.measureInWindow((x: number, y: number) => {
                          setStep1MapPos({ x, y });
                        });
                      }
                    }}
                  >
                    {selectedBuilding?.masterPlanUrl && (
                      <View
                        className="w-full h-full justify-center items-center"
                        style={{ touchAction: 'none' } as any}
                        onStartShouldSetResponder={() => true}
                        onMoveShouldSetResponder={() => step1PanMode}
                        onResponderTerminationRequest={() => false}
                        onResponderGrant={(e) => handleTouchStart(e, step1Zoom, step1PanOffset, step1PanMode, handleStep1Paint)}
                        onResponderMove={(e) => handleTouchMove(e, step1Zoom, setStep1Zoom, setStep1PanOffset, step1PanMode, undefined)}
                        // @ts-ignore - onWheel is passed through to the DOM by react-native-web
                        onWheel={(e: any) => {
                          if (Platform.OS === 'web' && e.nativeEvent.deltaY) {
                            setStep1Zoom(z => Math.max(1, Math.min(5, z - (e.nativeEvent.deltaY > 0 ? 0.2 : -0.2))));
                          }
                        }}
                      >
                        <View
                          style={{
                            width: imgLayout.w,
                            height: imgLayout.h,
                            overflow: 'hidden',
                            position: 'relative',
                          }}
                        >
                          <View
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              width: imgLayout.w,
                              height: imgLayout.h,
                              transform: [
                                { scale: step1Zoom },
                                { translateX: step1PanOffset.x },
                                { translateY: step1PanOffset.y }
                              ]
                            }}
                          >
                          <Image
                            source={{ uri: selectedBuilding.masterPlanUrl }}
                            className="w-full h-full"
                            resizeMode="contain"
                          />
                          {calibPoints.map((p, i) => {
                            if (!p) return null;
                            const labelStr = selectedBuilding?.polygon?.[i]?.label;
                            const labelShort = labelStr ? labelStr.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase() : `P${i + 1}`;
                            const isLegacyPixels = p.x > 2;
                            const bounds = getRenderedImageBounds();
                            const px = isLegacyPixels ? p.x : bounds.offsetX + p.x * bounds.renderW;
                            const py = isLegacyPixels ? p.y : bounds.offsetY + p.y * bounds.renderH;
                            return (
                              <TouchableOpacity
                                key={i}
                                activeOpacity={0.8}
                                className="absolute items-center justify-center"
                                // @ts-ignore - Web specific properties to prevent parent map panning
                                onTouchStart={(e) => e.stopPropagation()}
                                // @ts-ignore
                                onPointerDown={(e: any) => { if (e.stopPropagation) e.stopPropagation(); }}
                                style={{ 
                                  left: px - 20, 
                                  top: py - 20, 
                                  width: 40, 
                                  height: 40, 
                                  zIndex: activeCalibIdx === i ? 10 : 1,
                                  transform: [{ scale: 1 / step1Zoom }]
                                }}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  if (activeCalibIdx === i) {
                                    setActiveCalibIdx(-1);
                                  } else {
                                    setActiveCalibIdx(i);
                                    setStep1PanMode(false);
                                  }
                                }}
                              >
                                {activeCalibIdx === i ? (
                                  <View className="absolute pointer-events-none" style={{ left: 4, top: 4, width: 32, height: 32, transform: [{ scale: step1Zoom }] }}>
                                    <View className="absolute bg-red-500 shadow-md shadow-black" style={{ left: 15, top: 0, width: 2, height: 12 }} />
                                    <View className="absolute bg-red-500 shadow-md shadow-black" style={{ left: 15, bottom: 0, width: 2, height: 12 }} />
                                    <View className="absolute bg-red-500 shadow-md shadow-black" style={{ top: 15, left: 0, width: 12, height: 2 }} />
                                    <View className="absolute bg-red-500 shadow-md shadow-black" style={{ top: 15, right: 0, width: 12, height: 2 }} />
                                  </View>
                                ) : (
                                  <>
                                    <MaterialCommunityIcons
                                      name="crosshairs-gps"
                                      size={40}
                                      color="#22c55e"
                                    />
                                    <Text className="text-white text-[10px] font-bold absolute top-2">{labelShort}</Text>
                                  </>
                                )}
                                {activeCalibIdx === i && (() => {
                                  const screenX = (px - imgLayout.w / 2) * step1Zoom + step1PanOffset.x + imgLayout.w / 2;
                                  const screenY = (py - imgLayout.h / 2) * step1Zoom + step1PanOffset.y + imgLayout.h / 2;
                                  const dpadBaseLeft = screenX > imgLayout.w - 140 ? -125 : 75;
                                  const dpadBaseTop = screenY < 100 ? 40 : (screenY > imgLayout.h - 100 ? -90 : -25);
                                  return (
                                    <View className="absolute bg-neutral-900/90 rounded-full border border-neutral-600 shadow-xl z-50 flex-row items-center justify-center" style={{ width: 90, height: 90, left: dpadBaseLeft, top: dpadBaseTop }}>
                                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleNudgeCalib(i, 0, -1); }} className="absolute top-1 p-2 bg-neutral-700 rounded-full"><MaterialCommunityIcons name="chevron-up" size={24} color="white" /></TouchableOpacity>
                                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleNudgeCalib(i, 0, 1); }} className="absolute bottom-1 p-2 bg-neutral-700 rounded-full"><MaterialCommunityIcons name="chevron-down" size={24} color="white" /></TouchableOpacity>
                                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleNudgeCalib(i, -1, 0); }} className="absolute left-1 p-2 bg-neutral-700 rounded-full"><MaterialCommunityIcons name="chevron-left" size={24} color="white" /></TouchableOpacity>
                                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleNudgeCalib(i, 1, 0); }} className="absolute right-1 p-2 bg-neutral-700 rounded-full"><MaterialCommunityIcons name="chevron-right" size={24} color="white" /></TouchableOpacity>
                                      
                                      {/* Green Set Button */}
                                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); setActiveCalibIdx(-1); }} className="w-8 h-8 bg-green-500 rounded-full border border-white items-center justify-center">
                                        <MaterialCommunityIcons name="check-bold" size={16} color="white" />
                                      </TouchableOpacity>
                                    </View>
                                  );
                                })()}
                              </TouchableOpacity>
                            )
                          })}
                          </View>
                        </View>
                      </View>
                    )}
                  </View>

                  <View className="flex-row justify-between mb-0">
                    <TouchableOpacity className="bg-neutral-700 px-6 py-3 rounded-xl flex-1 mr-2 items-center" onPress={() => { setCalibPoints([]); setActiveCalibIdx(0); }}>
                      <Text className="text-white font-bold text-lg">Clear Points</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="px-6 py-3 rounded-xl flex-1 ml-2 items-center bg-blue-600"
                      onPress={() => {
                        performAutoZoom();
                        setMapEditorStep(2);
                      }}
                    >
                      <Text className="text-white font-bold text-lg">Next: Safe Routes ➔</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
                <ScrollView className="flex-1" style={{ display: mapEditorStep === 2 ? 'flex' : 'none' }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
                  <Text className="text-neutral-400 text-lg mb-4">Select a brush type, then tap the map to paint grid cells.</Text>

                  {/* Toolbar */}
                  <View className="flex-row space-x-2 mb-2">
                    <TouchableOpacity
                      className={`flex-1 py-3 rounded-xl items-center border-2 ${gridPaintMode === "safe" ? 'bg-blue-600 border-blue-400' : 'bg-neutral-800 border-neutral-700'}`}
                      onPress={() => setGridPaintMode("safe")}
                    >
                      <Text className="text-white font-bold text-lg">🟦 Safe Route</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className={`flex-1 py-3 rounded-xl items-center border-2 ${gridPaintMode === "exit" ? 'bg-green-600 border-green-400' : 'bg-neutral-800 border-neutral-700'}`}
                      onPress={() => setGridPaintMode("exit")}
                    >
                      <Text className="text-white font-bold text-lg">🚪 Exit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className={`flex-1 py-3 rounded-xl items-center border-2 ${gridPaintMode === "erase" ? 'bg-red-600 border-red-400' : 'bg-neutral-800 border-neutral-700'}`}
                      onPress={() => setGridPaintMode("erase")}
                    >
                      <Text className="text-white font-bold text-lg">🧹 Erase</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className={`flex-1 py-3 rounded-xl items-center border-2 ${gridPaintMode === "pan" ? 'bg-amber-600 border-amber-400' : 'bg-neutral-800 border-neutral-700'}`}
                      onPress={() => setGridPaintMode("pan")}
                    >
                      <Text className="text-white font-bold">✋ Pan</Text>
                    </TouchableOpacity>
                  </View>

                  <View className="flex-row justify-between items-center mb-4">
                    <View className="flex-row space-x-2">
                      <Text className="text-white my-auto font-bold mr-2">Grid Size:</Text>
                      <TouchableOpacity
                        className="bg-neutral-700 p-2 rounded-lg"
                        onPress={() => setGridSizeMeters(s => Math.max(0.5, s - 0.1))}
                      >
                        <MaterialCommunityIcons name="minus" size={20} color="white" />
                      </TouchableOpacity>
                      <Text className="text-white my-auto font-bold w-12 text-center">{gridSizeMeters.toFixed(1)}m</Text>
                      <TouchableOpacity
                        className="bg-neutral-700 p-2 rounded-lg"
                        onPress={() => setGridSizeMeters(s => Math.min(5.0, s + 0.1))}
                      >
                        <MaterialCommunityIcons name="plus" size={20} color="white" />
                      </TouchableOpacity>
                    </View>
                    <View className="flex-row space-x-2">
                      <Text className="text-white my-auto font-bold mr-2">Zoom:</Text>
                      <TouchableOpacity
                        className="bg-neutral-700 p-2 rounded-lg"
                        onPress={() => {
                          setStep1Zoom(z => Math.max(1, z - 0.5));
                        }}
                      >
                        <MaterialCommunityIcons name="minus" size={20} color="white" />
                      </TouchableOpacity>
                      <Text className="text-white my-auto font-bold w-10 text-center">{Math.round(step1Zoom * 100)}%</Text>
                      <TouchableOpacity
                        className="bg-neutral-700 p-2 rounded-lg"
                        onPress={() => {
                          setStep1Zoom(z => Math.min(5, z + 0.5));
                        }}
                      >
                        <MaterialCommunityIcons name="plus" size={20} color="white" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View
                    ref={step2MapRef}
                    className="bg-neutral-800 rounded-xl mb-4 w-full justify-center items-center relative overflow-hidden"
                    style={{ height: getDynamicMapHeight() }}
                    onLayout={(e) => {
                      setImgLayout({ w: Math.max(1, e.nativeEvent.layout.width), h: Math.max(1, e.nativeEvent.layout.height) });
                      if (Platform.OS === 'web' && step2MapRef.current) {
                        const rect = step2MapRef.current.getBoundingClientRect();
                        setStep2MapPos({ x: rect.left + window.scrollX, y: rect.top + window.scrollY });
                      } else if (step2MapRef.current) {
                        step2MapRef.current.measureInWindow((x: number, y: number) => {
                          setStep2MapPos({ x, y });
                        });
                      }
                    }}
                  >
                    {selectedBuilding?.masterPlanUrl && (
                      <View
                        className="w-full h-full justify-center items-center"
                        style={{ touchAction: 'none' } as any}
                        onStartShouldSetResponder={() => true}
                        onMoveShouldSetResponder={() => gridPaintMode === "pan"}
                        onResponderTerminationRequest={() => false}
                        onResponderGrant={(e) => handleTouchStart(e, step1Zoom, step1PanOffset, gridPaintMode === "pan", handleGridInteraction)}
                        onResponderMove={(e) => handleTouchMove(e, step1Zoom, setStep1Zoom, setStep1PanOffset, gridPaintMode === "pan", handleGridInteraction)}
                        // @ts-ignore - onWheel is passed through to the DOM by react-native-web
                        onWheel={(e: any) => {
                          if (Platform.OS === 'web' && e.nativeEvent.deltaY) {
                            setStep1Zoom(z => Math.max(1, Math.min(5, z - (e.nativeEvent.deltaY > 0 ? 0.2 : -0.2))));
                          }
                        }}
                      >
                        <View
                          style={{
                            width: imgLayout.w,
                            height: imgLayout.h,
                            overflow: 'hidden',
                            position: 'relative',
                            pointerEvents: 'none'
                          }}
                        >
                          <View
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              width: imgLayout.w,
                              height: imgLayout.h,
                              transform: [
                                { scale: step1Zoom },
                                { translateX: step1PanOffset.x },
                                { translateY: step1PanOffset.y }
                              ]
                            }}
                          >
                            <Image
                              source={{ uri: selectedBuilding.masterPlanUrl }}
                              className="w-full h-full opacity-70"
                              resizeMode="contain"
                            />

                            {/* Lightweight Grid Overlay & Painted Cells */}
                            {(() => {
                              const { rows, cols, minLat, maxLat, minLon, maxLon, cellLatSpan, cellLonSpan } = getGridDimensions();
                              const bounds = getRenderedImageBounds();
                              
                              const gridLines = [];
                              const reqPins = selectedBuilding?.polygon?.length || 4;
                              const currentCalib = calibPoints.filter(Boolean).length >= reqPins ? calibPoints.filter(Boolean) : selectedBuilding?.imageCalibrationPoints;
                              if (rows > 0 && cols > 0 && currentCalib && currentCalib.length >= reqPins) {
                                const tl = mapGPSToImage(maxLat, minLon);
                                const br = mapGPSToImage(minLat, maxLon);
                                if (tl && br) {
                                  const isLegacy = currentCalib[0]?.x > 2;
                                  const tlX = isLegacy ? tl.x : bounds.offsetX + tl.x * bounds.renderW;
                                  const brX = isLegacy ? br.x : bounds.offsetX + br.x * bounds.renderW;
                                  const tlY = isLegacy ? tl.y : bounds.offsetY + tl.y * bounds.renderH;
                                  const brY = isLegacy ? br.y : bounds.offsetY + br.y * bounds.renderH;
                                  const tlGrid = mapGPSToImage(maxLat, minLon);
                                  const brGrid = mapGPSToImage(maxLat - (rows * cellLatSpan), minLon + (cols * cellLonSpan));
                                  if (tlGrid && brGrid) {
                                    const tlxG = isLegacy ? tlGrid.x : bounds.offsetX + tlGrid.x * bounds.renderW;
                                    const brxG = isLegacy ? brGrid.x : bounds.offsetX + brGrid.x * bounds.renderW;
                                    const tlyG = isLegacy ? tlGrid.y : bounds.offsetY + tlGrid.y * bounds.renderH;
                                    const bryG = isLegacy ? brGrid.y : bounds.offsetY + brGrid.y * bounds.renderH;
                                    
                                    for (let c = 0; c <= cols; c++) {
                                      const lx = tlxG + (c / cols) * (brxG - tlxG);
                                      gridLines.push(<View key={`v-${c}`} style={{ position: 'absolute', left: lx, top: tlyG, width: 1, height: bryG - tlyG, backgroundColor: 'rgba(255,255,255,0.2)', pointerEvents: 'none' }} />);
                                    }
                                    for (let r = 0; r <= rows; r++) {
                                      const ly = tlyG + (r / rows) * (bryG - tlyG);
                                      gridLines.push(<View key={`h-${r}`} style={{ position: 'absolute', left: tlxG, top: ly, width: brxG - tlxG, height: 1, backgroundColor: 'rgba(255,255,255,0.2)', pointerEvents: 'none' }} />);
                                    }
                                  }
                                }
                              }
                              
                              return (
                                <>
                                  {gridLines}
                                  {gridPaths.map(p => {
                                const latCenter = maxLat - ((p.row + 0.5) * cellLatSpan);
                                const lonCenter = minLon + ((p.col + 0.5) * cellLonSpan);
                                const pu = mapGPSToImage(latCenter, lonCenter);
                                if (!pu) return null;

                                const isLegacy = pu.x > 2;
                                const sx = isLegacy ? pu.x : bounds.offsetX + pu.x * bounds.renderW;
                                const sy = isLegacy ? pu.y : bounds.offsetY + pu.y * bounds.renderH;

                                const cellTopLeft = mapGPSToImage(maxLat - (p.row * cellLatSpan), minLon + (p.col * cellLonSpan));
                                const cellBottomRight = mapGPSToImage(maxLat - ((p.row + 1) * cellLatSpan), minLon + ((p.col + 1) * cellLonSpan));

                                let finalLeft = sx - 10;
                                let finalTop = sy - 10;
                                let cellW = 20;
                                let cellH = 20;

                                if (cellTopLeft && cellBottomRight) {
                                  const tlX = isLegacy ? cellTopLeft.x : bounds.offsetX + cellTopLeft.x * bounds.renderW;
                                  const brX = isLegacy ? cellBottomRight.x : bounds.offsetX + cellBottomRight.x * bounds.renderW;
                                  const tlY = isLegacy ? cellTopLeft.y : bounds.offsetY + cellTopLeft.y * bounds.renderH;
                                  const brY = isLegacy ? cellBottomRight.y : bounds.offsetY + cellBottomRight.y * bounds.renderH;
                                  finalLeft = tlX;
                                  finalTop = tlY;
                                  cellW = Math.abs(brX - tlX);
                                  cellH = Math.abs(brY - tlY);
                                }

                                return (
                                  <View
                                    key={`grid-${p.row}-${p.col}`}
                                    className={`absolute items-center justify-center border ${p.isExit ? 'bg-green-600/80 border-green-500' : 'bg-lime-500/80 border-lime-400'}`}
                                    style={{
                                      pointerEvents: 'none',
                                      left: finalLeft,
                                      top: finalTop,
                                      width: cellW,
                                      height: cellH,
                                      zIndex: p.isExit ? 10 : 1
                                    }}
                                  >
                                    {p.isExit && <Text style={{ pointerEvents: 'none' }} className="text-white text-[8px] font-bold">E</Text>}
                                  </View>
                                );
                              })}
                            </>
                          );
                        })()}
                          </View>
                        </View>
                      </View>
                    )}
                  </View>

                  <View className="bg-blue-900/30 p-4 rounded-xl border border-blue-600/50 mb-6 flex-row">
                    <Text className="text-blue-500 mr-3 text-2xl">💡</Text>
                    <View className="flex-1">
                      <Text className="text-blue-400 font-bold mb-1 uppercase tracking-wider text-lg">Grid Strategy</Text>
                      <Text className="text-blue-300 text-base">Paint <Text className="font-bold text-white text-base">Safe Routes</Text> along corridors and rooms to define where users can walk. Mark <Text className="font-bold text-white text-base">Exits</Text> at the doors. The system automatically calculates the shortest path through painted routes.</Text>
                    </View>
                  </View>

                  <View className="flex-row justify-between mb-0">
                    <TouchableOpacity className="flex-1 bg-neutral-700 py-3 rounded-xl items-center mr-2" onPress={() => setGridPaths([])}>
                      <Text className="text-white font-bold">Clear Grid</Text>
                    </TouchableOpacity>
                    {(() => {
                      const requiredPins = selectedBuilding?.polygon?.length || 4;
                      const hasAllPins = calibPoints.filter(Boolean).length === requiredPins;
                      const hasSafeRoute = gridPaths.some(p => !p.isExit);
                      const hasExit = gridPaths.some(p => p.isExit);
                      const isSaveReady = hasAllPins && hasSafeRoute && hasExit;

                      return (
                        <TouchableOpacity
                          className={`flex-1 py-3 rounded-xl items-center ${isSaveReady ? 'bg-green-600' : 'bg-neutral-600 opacity-50'}`}
                          disabled={!isSaveReady}
                          onPress={async () => {
                            try {
                              await updateBuildingCalibration({ clerkId: user?.id || "", buildingId: selectedBuilding._id, calibrationPoints: calibPoints });
                              await updateBuildingGridPaths({ clerkId: user?.id || "", buildingId: selectedBuilding._id, gridPaths });
                              setIsMapEditorOpen(false);
                              showToast("Floor plan configured successfully!");
                            } catch (e) { showToast("Error saving layout", "error"); }
                          }}
                        >
                          <Text className="text-white font-bold text-lg">Save Configuration</Text>
                        </TouchableOpacity>
                      );
                    })()}
                  </View>
                </ScrollView>
              </>
            )}
        </View>
      </Modal>

      {/* Manage Site Modal */}
      <Modal visible={manageSiteName !== null} animationType="slide" presentationStyle="pageSheet">
        {manageSiteName && (
          <ScrollView className="flex-1 bg-neutral-900 pt-12 px-6" contentContainerStyle={{ paddingBottom: 120 }}>
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-extrabold text-white">Manage Site Details</Text>
              <TouchableOpacity onPress={() => setManageSiteName(null)} className="bg-neutral-800 p-2 rounded-full border border-neutral-700">
                <Text className="text-white font-bold">✕</Text>
              </TouchableOpacity>
            </View>
            <View className="bg-neutral-800 p-6 rounded-2xl border border-neutral-700 mb-6">
              <Text className="text-white font-bold mb-2">Site Name</Text>
              <TextInput
                className="bg-neutral-700 border border-neutral-600 rounded-xl p-4 text-white mb-4 opacity-50"
                value={manageSiteName}
                editable={false}
              />
              <Text className="text-white font-bold mb-2">Fire Service Description (Hazards & Assembly)</Text>
              <TextInput
                className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-white mb-4"
                value={siteDesc}
                onChangeText={setSiteDesc}
                placeholder="Details of the site, hazards, assembly points..."
                placeholderTextColor="#525252"
                multiline
                numberOfLines={4}
                style={{ height: 100, textAlignVertical: 'top' }}
              />
              <Text className="text-white font-bold mb-2">Site Admin Name (Responsible Person)</Text>
              <TextInput
                className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-white mb-4"
                value={siteAdminName}
                onChangeText={setSiteAdminName}
                placeholder="e.g., John Doe"
                placeholderTextColor="#525252"
              />
              <Text className="text-white font-bold mb-2">Site Admin Contact Phone</Text>
              <TextInput
                className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-white mb-4"
                value={sitePhone}
                onChangeText={setSitePhone}
                placeholder="e.g., +44 123 456789"
                placeholderTextColor="#525252"
                keyboardType="phone-pad"
              />
              <Text className="text-white font-bold mb-2">Local Emergency Services / Fire Brigade Phone</Text>
              <TextInput
                className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-white mb-6"
                value={siteEmergencyPhone}
                onChangeText={setSiteEmergencyPhone}
                placeholder="e.g., 999 or Local Dispatch Number"
                placeholderTextColor="#525252"
                keyboardType="phone-pad"
              />
              <TouchableOpacity
                className={`py-4 rounded-xl items-center ${isUploading ? 'bg-neutral-700' : 'bg-blue-600'}`}
                disabled={isUploading}
                onPress={async () => {
                  try {
                    await updateSiteInfo({
                      clerkId: user?.id || "",
                      siteName: manageSiteName,
                      description: siteDesc,
                      adminContactName: siteAdminName,
                      contactPhone: sitePhone,
                      emergencyServicesPhone: siteEmergencyPhone,
                    });
                    setManageSiteName(null);
                    showToast("Site details saved successfully!");
                  } catch (e) {
                    showToast("Error updating site", "error");
                  }
                }}
              >
                <Text className="text-white font-bold text-lg">Save Site Details</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </Modal>

      {/* History Modal */}
      <Modal visible={isHistoryOpen} animationType="slide" presentationStyle="formSheet">
        <View className="flex-1 bg-black p-6 pt-10">
          <View className="flex-row justify-between items-center mb-6 border-b border-neutral-800 pb-4">
            <View>
              <Text className="text-3xl font-black text-white tracking-widest">History Logs</Text>
              <Text className="text-neutral-400 mt-1">Review past incidents and drills</Text>
            </View>
            <TouchableOpacity onPress={() => setIsHistoryOpen(false)} className="bg-neutral-800 p-3 rounded-full">
              <Text className="text-white text-lg">✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
            <View className="mb-6 flex-row justify-end">
              <TouchableOpacity onPress={exportLogs} className="bg-neutral-800 px-4 py-3 rounded-xl border border-neutral-700 flex-row items-center">
                <MaterialCommunityIcons name="download" size={18} color="white" style={{ marginRight: 8 }} />
                <Text className="text-white font-bold">Export All Logs to CSV</Text>
              </TouchableOpacity>
            </View>

            {(!allIncidentsHistory || allIncidentsHistory.length === 0) ? (
              <View className="items-center py-10 bg-neutral-900 rounded-3xl border border-neutral-800">
                <Text className="text-4xl mb-3">📋</Text>
                <Text className="text-neutral-400 font-bold text-lg">No incident history</Text>
                <Text className="text-neutral-500 text-sm mt-1">Drills and evacuations will appear here</Text>
              </View>
            ) : (
              Object.keys(groupedIncidents).map(monthKey => (
                <View key={monthKey} className="mb-8">
                  <View className="flex-row justify-between items-center mb-4 px-2">
                    <Text className="text-white font-bold text-xl">{monthKey}</Text>
                    <TouchableOpacity
                      className="bg-red-900/40 px-3 py-1.5 rounded-lg border border-red-500/50"
                      onPress={() => {
                        confirmAction(
                          "Delete Logs",
                          `Are you sure you want to delete all ${groupedIncidents[monthKey].length} logs from ${monthKey}? This cannot be undone.`,
                          async () => {
                            try {
                              await deleteIncidents({
                                clerkId: user?.id || "",
                                incidentIds: groupedIncidents[monthKey].map((i: any) => i._id)
                              });
                              showToast(`Deleted logs for ${monthKey}`);
                            } catch (e) {
                              showToast("Failed to delete logs", "error");
                            }
                          },
                          "danger"
                        );
                      }}
                    >
                      <Text className="text-red-400 font-bold text-xs">Delete Month</Text>
                    </TouchableOpacity>
                  </View>
                  {groupedIncidents[monthKey].map((inc: any) => {
                    const durationMs = (inc.resolvedAt || Date.now()) - inc.triggeredAt;
                    const durationMins = Math.floor(durationMs / 60000);
                    const durationSecs = Math.floor((durationMs % 60000) / 1000);

                    return (
                      <View key={inc._id} className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl mb-4 flex-row justify-between items-center shadow-lg">
                        <View>
                          <View className="flex-row items-center mb-1">
                            <Text className={`font-black text-lg ${inc.isDrill ? 'text-amber-500' : 'text-red-500'}`}>
                              {inc.isDrill ? '🔔 TEST DRILL' : '🚨 REAL EVACUATION'}
                            </Text>
                            {!inc.resolvedAt && (
                              <View className="bg-red-500 px-2 py-0.5 rounded ml-2">
                                <Text className="text-white text-[10px] font-bold">ONGOING</Text>
                              </View>
                            )}
                          </View>
                          <Text className="text-white font-bold text-base mt-1">{inc.buildingName}</Text>
                          <Text className="text-neutral-400 text-sm mt-1">{new Date(inc.triggeredAt).toLocaleString()}</Text>
                        </View>
                        <View className="bg-black/50 px-4 py-3 rounded-xl items-center border border-neutral-800">
                          <Text className="text-neutral-500 text-[10px] uppercase font-black tracking-widest mb-1">Duration</Text>
                          <Text className="text-white font-black text-xl">{durationMins}m {durationSecs}s</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
            <View className="h-10" />
          </ScrollView>
        </View>
      </Modal>

      {/* Universal Confirmation Modal (Moved to bottom for proper z-index) */}
      <Modal visible={confirmDialog.visible} animationType="fade" transparent>
        <View className="flex-1 bg-black/80 justify-center items-center px-6">
          <View className="bg-neutral-900 border border-neutral-700 p-6 rounded-3xl w-full max-w-sm">
            <Text className={`text-xl font-black mb-2 tracking-wide ${confirmDialog.intent === 'danger' ? 'text-red-500' : confirmDialog.intent === 'warning' ? 'text-amber-500' : 'text-green-400'}`}>
              {confirmDialog.title}
            </Text>
            <Text className="text-neutral-300 text-base mb-8 leading-relaxed">{confirmDialog.message}</Text>

            <View className="flex-row space-x-4">
              <TouchableOpacity
                className="flex-1 bg-neutral-800 py-4 rounded-xl items-center border border-neutral-700 mr-2"
                onPress={() => setConfirmDialog({ ...confirmDialog, visible: false })}
              >
                <Text className="text-white font-bold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 py-4 rounded-xl items-center border ${confirmDialog.intent === 'danger' ? 'bg-red-600 border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.5)]' : confirmDialog.intent === 'warning' ? 'bg-amber-600 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]' : 'bg-green-600 border-green-500 shadow-[0_0_15px_rgba(22,163,74,0.5)]'}`}
                onPress={() => {
                  setConfirmDialog({ ...confirmDialog, visible: false });
                  confirmDialog.onConfirm();
                }}
              >
                <Text className="text-white font-bold text-lg">{confirmDialog.intent === 'danger' || confirmDialog.intent === 'warning' ? 'Trigger' : 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}
