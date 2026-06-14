import { showToast } from "./Toast";
import React from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Platform, Image, Alert, useWindowDimensions } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import LiveRollCall from "./LiveRollCall";

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

  const [isRegistering, setIsRegistering] = React.useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [selectedBuilding, setSelectedBuilding] = React.useState<any>(null);

  const [isMapEditorOpen, setIsMapEditorOpen] = React.useState(false);
  const [isLocatingUser, setIsLocatingUser] = React.useState(false);
  const [mapEditorStep, setMapEditorStep] = React.useState<1 | 2>(1); // 1 = Calibration, 2 = Safe Routes
  const [gridPaintMode, setGridPaintMode] = React.useState<"safe" | "exit" | "erase" | "pan">("safe");
  const [userZoom, setUserZoom] = React.useState(1);
  const [step1Zoom, setStep1Zoom] = React.useState(1);
  const [step1PanMode, setStep1PanMode] = React.useState(false);

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

  const [showSettings, setShowSettings] = React.useState(false);
  const [setupName, setSetupName] = React.useState("");
  const [setupPhone, setSetupPhone] = React.useState("");
  const [isSavingSetup, setIsSavingSetup] = React.useState(false);
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
    if (!selectedBuilding?.polygon || selectedBuilding.polygon.length < 4) return { rows: 1, cols: 1, minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };
    const poly = selectedBuilding.polygon;
    const minLat = Math.min(...poly.map((p: any) => p.lat));
    const maxLat = Math.max(...poly.map((p: any) => p.lat));
    const minLon = Math.min(...poly.map((p: any) => p.lon));
    const maxLon = Math.max(...poly.map((p: any) => p.lon));

    const heightMeters = getDistanceInMeters(minLat, minLon, maxLat, minLon);
    const widthMeters = getDistanceInMeters(minLat, minLon, minLat, maxLon);

    const rows = Math.max(1, Math.ceil(heightMeters / 5));
    const cols = Math.max(1, Math.ceil(widthMeters / 5));

    return { rows, cols, minLat, maxLat, minLon, maxLon };
  };

  const getDynamicMapHeight = () => {
    if (selectedBuilding?.imageCalibrationPoints?.length >= 4 && imageAspectRatio) {
      const calib = selectedBuilding.imageCalibrationPoints;
      // We assume pixel percentages (x <= 1, y <= 1) based on current architecture
      // For legacy compatibility, we'll gracefully fallback to standard bounding if needed.
      const minCX = Math.min(...calib.map((c: any) => c.x));
      const maxCX = Math.max(...calib.map((c: any) => c.x));
      const minCY = Math.min(...calib.map((c: any) => c.y));
      const maxCY = Math.max(...calib.map((c: any) => c.y));

      const widthPct = maxCX - minCX;
      const heightPct = maxCY - minCY;

      if (widthPct > 0 && heightPct > 0 && widthPct <= 1 && heightPct <= 1) {
        const boxAspect = (widthPct / heightPct) * imageAspectRatio;
        const containerWidth = width - 48; // padding
        return Math.max(100, Math.min(height * 0.8, containerWidth / boxAspect));
      }
    }

    if (!selectedBuilding?.polygon || selectedBuilding.polygon.length < 4) return 400;
    const poly = selectedBuilding.polygon;
    const minLat = Math.min(...poly.map((p: any) => p.lat));
    const maxLat = Math.max(...poly.map((p: any) => p.lat));
    const minLon = Math.min(...poly.map((p: any) => p.lon));
    const maxLon = Math.max(...poly.map((p: any) => p.lon));

    const heightMeters = getDistanceInMeters(minLat, minLon, maxLat, minLon);
    const widthMeters = getDistanceInMeters(minLat, minLon, minLat, maxLon);

    if (widthMeters > 0 && heightMeters > 0) {
      const containerWidth = width - 48;
      const aspect = widthMeters / heightMeters;
      return Math.max(100, Math.min(height * 0.8, containerWidth / aspect));
    }
    return 400;
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
          onPaint(touches[0].locationX, touches[0].locationY);
        }
      } else {
        // web single touch
        gestureState.current.lastCenter = { x: e.nativeEvent.pageX || 0, y: e.nativeEvent.pageY || 0 };
        gestureState.current.lastPan = currentPan;
        if (!isPanMode && onPaint) {
          onPaint((e.nativeEvent as any).offsetX !== undefined ? (e.nativeEvent as any).offsetX : e.nativeEvent.locationX, (e.nativeEvent as any).offsetY !== undefined ? (e.nativeEvent as any).offsetY : e.nativeEvent.locationY);
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
    onPaint: (rawX: number, rawY: number) => void
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
        const rawX = Platform.OS === 'web' && (e.nativeEvent as any).offsetX !== undefined ? (e.nativeEvent as any).offsetX : e.nativeEvent.locationX;
        const rawY = Platform.OS === 'web' && (e.nativeEvent as any).offsetY !== undefined ? (e.nativeEvent as any).offsetY : e.nativeEvent.locationY;
        onPaint(rawX, rawY);
      }
    }
  };

  const getMapTransform = () => {
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
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
        const idealMaskW = boxW_px / 0.95;
        const idealMaskH = boxH_px / 0.95;

        const containerW = imgLayout.w;
        const containerH = imgLayout.h;

        const baseScale = Math.min(containerW / idealMaskW, containerH / idealMaskH);
        scale = baseScale * userZoom;

        maskW = idealMaskW * scale;
        maskH = idealMaskH * scale;

        boxCenterX = bounds.offsetX + ((minCX + maxCX) / 2) * bounds.renderW;
        boxCenterY = bounds.offsetY + ((minCY + maxCY) / 2) * bounds.renderH;

        translateX = maskW / 2 - imgLayout.w / 2 - (boxCenterX - imgLayout.w / 2) * scale + mapPanOffset.x;
        translateY = maskH / 2 - imgLayout.h / 2 - (boxCenterY - imgLayout.h / 2) * scale + mapPanOffset.y;
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

    const isNewPlacement = !calibPoints[activeCalibIdx];
    const newPoints = [...calibPoints];
    newPoints[activeCalibIdx] = { x, y };
    setCalibPoints(newPoints);
    if (isNewPlacement && activeCalibIdx < (selectedBuilding?.polygon?.length || 4) - 1) {
      setActiveCalibIdx(activeCalibIdx + 1);
    }
  };

  const handleGridInteraction = (screenX: number, screenY: number) => {
    const { scale, maskW, maskH, boxCenterX, boxCenterY } = getMapTransform();

    let rawX = screenX;
    let rawY = screenY;

    if (boxCenterX !== undefined && boxCenterY !== undefined) {
      rawX = boxCenterX + (screenX - imgLayout.w / 2 - mapPanOffset.x) / scale;
      rawY = boxCenterY + (screenY - imgLayout.h / 2 - mapPanOffset.y) / scale;
    }

    const gps = mapImageToGPS(rawX, rawY);
    const { rows, cols, minLat, maxLat, minLon, maxLon } = getGridDimensions();
    const row = Math.floor((maxLat - gps.lat) / (maxLat - minLat) * rows);
    const col = Math.floor((gps.lon - minLon) / (maxLon - minLon) * cols);

    if (row >= 0 && row < rows && col >= 0 && col < cols) {
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
            lat: maxLat - ((row + 0.5) * (maxLat - minLat) / rows),
            lon: minLon + ((col + 0.5) * (maxLon - minLon) / cols),
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

    const calib = calibPoints.length >= 4 ? calibPoints : selectedBuilding.imageCalibrationPoints;
    if (calib && calib.length >= 4) {
      const isLegacyPixels = calib[0].x > 2;
      const minCX = Math.min(...calib.map((c: any) => isLegacyPixels ? c.x / Math.max(1, imgLayout.w) : c.x));
      const maxCX = Math.max(...calib.map((c: any) => isLegacyPixels ? c.x / Math.max(1, imgLayout.w) : c.x));
      const minCY = Math.min(...calib.map((c: any) => isLegacyPixels ? c.y / Math.max(1, imgLayout.h) : c.y));
      const maxCY = Math.max(...calib.map((c: any) => isLegacyPixels ? c.y / Math.max(1, imgLayout.h) : c.y));

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

    const newPoints = [...calibPoints];
    newPoints[idx] = { x: newX, y: newY };
    setCalibPoints(newPoints);
  };



  const handleMapPress = (e: any) => {
    if (e.nativeEvent.coordinate) {
      const defaultLabels = ["Top Left", "Bottom Left", "Bottom Right", "Top Right"];
      const label = bPins.length < 4 ? defaultLabels[bPins.length] : `P${bPins.length + 1}`;
      setBPins([...bPins, { lat: e.nativeEvent.coordinate.latitude, lon: e.nativeEvent.coordinate.longitude, label }]);
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
        const postUrl = await generateUploadUrl();
        const response = await fetch(bImageUri);
        const blob = await response.blob();
        const uploadResult = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": blob.type },
          body: blob,
        });
        const result = await uploadResult.json();
        storageId = result.storageId;
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
      showToast("Building registered successfully!");
    } catch (e) {
      console.log(e);
      showToast("Error saving building.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadImage = async (buildingId: any) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;
      setIsUploading(true);

      const imageUri = result.assets[0].uri;
      const response = await fetch(imageUri);
      const blob = await response.blob();

      const uploadUrl = await generateUploadUrl();
      const uploadResult = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": result.assets[0].mimeType || "image/jpeg" },
        body: blob,
      });

      const { storageId } = await uploadResult.json();

      if (user?.id) {
        await updateBuildingImage({
          clerkId: user.id,
          buildingId,
          storageId
        });
      }
      showToast("Floor plan uploaded successfully!");
    } catch (e) {
      console.log(e);
      showToast("Upload failed.", "error");
    } finally {
      setIsUploading(false);
    }
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

  const needsSetup = !dashboardData.name || !dashboardData.phone;
  if (needsSetup || showSettings) {
    return (
      <View className="flex-1 bg-neutral-900 pt-6 px-6">
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

        <Text className="text-neutral-400 mb-6">
          {needsSetup
            ? "Welcome to FireVision Admin! Please provide your emergency contact details before continuing."
            : "Update your emergency contact information below."}
        </Text>

        <View className="bg-neutral-800 p-6 rounded-3xl border border-neutral-700">
          <Text className="text-white font-bold mb-2">Full Name</Text>
          <TextInput
            className="bg-neutral-900 border border-neutral-700 text-white p-4 rounded-xl mb-6"
            placeholder="John Doe"
            placeholderTextColor="#666"
            value={setupName || dashboardData.name || ""}
            onChangeText={setSetupName}
          />

          <Text className="text-white font-bold mb-2">Emergency Phone Number</Text>
          <TextInput
            className="bg-neutral-900 border border-neutral-700 text-white p-4 rounded-xl mb-8"
            placeholder="+1 234 567 8900"
            placeholderTextColor="#666"
            keyboardType="phone-pad"
            value={setupPhone || dashboardData.phone || ""}
            onChangeText={setSetupPhone}
          />

          <TouchableOpacity
            className={`bg-red-600 py-4 rounded-xl items-center mb-6 ${isSavingSetup ? 'opacity-50' : ''}`}
            disabled={isSavingSetup || (!setupName && !dashboardData.name) || (!setupPhone && !dashboardData.phone)}
            onPress={async () => {
              setIsSavingSetup(true);
              try {
                await updateAdminProfile({
                  clerkId: user?.id || "",
                  name: setupName || dashboardData.name || "",
                  phone: setupPhone || dashboardData.phone || "",
                });
                setShowSettings(false);
              } catch (e) {
                showToast("Error saving profile", "error");
              } finally {
                setIsSavingSetup(false);
              }
            }}
          >
            {isSavingSetup ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Save Details</Text>}
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
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-900 pt-6">
      {/* Header */}
      <View className="px-6 flex-row justify-between items-center mb-6">
        <View className="flex-1 mr-4">
          <Text className="text-2xl font-extrabold text-white">Admin Console</Text>
          <Text className="text-red-400 font-bold text-xs mt-1" numberOfLines={1} ellipsizeMode="tail">{dashboardData.name || user?.primaryEmailAddress?.emailAddress}</Text>
        </View>
        <View className="flex-row items-center shrink-0">
          <TouchableOpacity
            className="bg-neutral-800 p-3 rounded-full border border-neutral-700 mr-2"
            onPress={() => setShowSettings(true)}
          >
            <Text className="text-white">⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-neutral-800 p-3 rounded-full border border-neutral-700"
            onPress={() => signOut()}
          >
            <Text className="text-white text-sm">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-6">

        {/* Quick Actions */}
        <View className="flex-row space-x-4 mb-8">
          <TouchableOpacity
            className="flex-1 bg-neutral-800 border border-neutral-700 p-4 rounded-2xl items-center mr-2"
            onPress={() => setIsRegistering(true)}
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
                <TouchableOpacity className="mt-4 bg-white/10 px-4 py-2 rounded-lg" onPress={() => setIsRegistering(true)}>
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
                      className="bg-neutral-700/50 p-1.5 rounded-full"
                      onPress={() => {
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
                      <Text className="text-sm">⚙️</Text>
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
                          className="bg-neutral-700/50 p-2 rounded-full"
                          onPress={() => {
                            setManageSiteName(siteName);
                            setSiteDesc(siteDetail?.description || "");
                            setSiteAdminName(siteDetail?.adminContactName || "");
                            setSitePhone(siteDetail?.contactPhone || "");
                            setSiteEmergencyPhone(siteDetail?.emergencyServicesPhone || "");
                          }}
                        >
                          <Text className="text-lg">⚙️</Text>
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
        <ScrollView className="flex-1 bg-neutral-900 pt-12 px-6">
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

          {!bName ? (
            <View className="bg-neutral-800 rounded-2xl justify-center items-center p-6 border border-neutral-700 opacity-50" style={{ height: 300 }}>
              <Text className="text-2xl mb-2">📸</Text>
              <Text className="text-white font-bold text-center">Enter a Building Name first</Text>
              <Text className="text-neutral-400 text-center text-xs mt-2">The map drawing tools will unlock once you name the building above.</Text>
            </View>
          ) : (
            <View className="bg-neutral-800 rounded-2xl overflow-hidden mb-6 border border-neutral-700 relative" style={{ height: 300 }}>
              {Platform.OS === 'web' || !MapView ? (
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
                    style={{ flex: 1 }}
                    onPress={handleMapPress}
                    initialRegion={{
                      latitude: 51.4717,
                      longitude: -2.1239,
                      latitudeDelta: 0.01,
                      longitudeDelta: 0.01,
                    }}
                  >
                    {bPins.map((pin, i) => (
                      <Marker key={i} coordinate={{ latitude: pin.lat, longitude: pin.lon }} />
                    ))}
                    {bPins.length > 2 && (
                      <Polygon
                        coordinates={bPins.map(p => ({ latitude: p.lat, longitude: p.lon }))}
                        fillColor="rgba(255, 0, 0, 0.3)"
                        strokeColor="rgba(255, 0, 0, 0.8)"
                        strokeWidth={2}
                      />
                    )}
                  </MapView>
                  <TouchableOpacity
                    className="absolute bottom-4 left-4 bg-neutral-900/80 p-3 rounded-full border border-neutral-700"
                    onPress={() => setBPins([])}
                  >
                    <Text className="text-white text-xs font-bold">Clear Pins</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          <Text className="text-neutral-300 font-bold mb-2">Master Plan Image</Text>
          <TouchableOpacity
            className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 items-center mb-6"
            onPress={async () => {
              const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (libPerm.granted === false) {
                showToast("Library permission is required!", "error");
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.8,
              });
              if (!result.canceled) {
                setBImageUri(result.assets[0].uri);
              }
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
            className={`py-4 rounded-xl items-center mb-8 ${bName && !hasSelfIntersection(bPins) ? 'bg-green-600' : 'bg-neutral-800'}`}
            onPress={handleSaveBuilding}
            disabled={!bName || hasSelfIntersection(bPins) || isUploading}
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
          <ScrollView className="flex-1 bg-neutral-900 pt-12 px-6">
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
              {Platform.OS === 'web' || !MapView ? (
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
                    style={{ flex: 1 }}
                    onPress={(e: any) => {
                      if (e.nativeEvent.coordinate && editingPins) {
                        setEditingPins([...editingPins, { lat: e.nativeEvent.coordinate.latitude, lon: e.nativeEvent.coordinate.longitude }]);
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
                          latitude: 51.4717,
                          longitude: -2.1239,
                          latitudeDelta: 0.01,
                          longitudeDelta: 0.01,
                        }
                    }
                  >
                    {editingPins?.map((pin: any, i: number) => (
                      <Marker key={i} coordinate={{ latitude: pin.lat, longitude: pin.lon }} />
                    ))}
                    {editingPins && editingPins.length > 2 && (
                      <Polygon
                        coordinates={editingPins.map((p: any) => ({ latitude: p.lat, longitude: p.lon }))}
                        fillColor="rgba(255, 0, 0, 0.3)"
                        strokeColor="rgba(255, 0, 0, 0.8)"
                        strokeWidth={2}
                      />
                    )}
                  </MapView>
                  <TouchableOpacity
                    className="absolute bottom-4 left-4 bg-neutral-900/80 p-3 rounded-full border border-neutral-700"
                    onPress={() => setEditingPins([])}
                  >
                    <Text className="text-white text-xs font-bold">Clear Pins</Text>
                  </TouchableOpacity>
                  {editingPins && editingPins !== selectedBuilding.polygon && editingPins.length >= 4 && !hasSelfIntersection(editingPins) && (
                    <TouchableOpacity
                      className="absolute bottom-4 right-4 bg-green-600 p-3 rounded-full"
                      onPress={async () => {
                        try {
                          await updateBuildingPolygon({
                            clerkId: user?.id || "",
                            buildingId: selectedBuilding._id,
                            polygon: editingPins
                          });
                          setSelectedBuilding({ ...selectedBuilding, polygon: editingPins });
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
              <View className="flex-row items-center mb-3 px-1">
                <Text className="flex-1 text-neutral-400 text-sm font-bold ml-1">Label</Text>
                <Text className="flex-1 text-neutral-400 text-sm font-bold ml-1">Latitude (N/S ↕️)</Text>
                <Text className="flex-1 text-neutral-400 text-sm font-bold ml-1">Longitude (E/W ↔️)</Text>
                <View className="w-10 ml-2" />
              </View>
              {editingPins?.map((p: any, i: number) => (
                <View key={i} className="flex-row items-center mb-3 w-full">
                  <View className="flex-1 mr-2">
                    <TextInput
                      style={{ minWidth: 0 }}
                      className="bg-neutral-900 border border-neutral-700 text-white p-3 rounded-lg text-sm w-full"
                      value={p.label !== undefined ? p.label : `P${i + 1}`}
                      placeholder={`P${i + 1}`}
                      placeholderTextColor="#525252"
                      onChangeText={(val) => {
                        const newPins = [...(editingPins || [])];
                        newPins[i].label = val;
                        setEditingPins(newPins);
                      }}
                    />
                  </View>

                  <View className="flex-1 mr-2">
                    <TextInput
                      style={{ minWidth: 0 }}
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

                  <View className="flex-1">
                    <TextInput
                      style={{ minWidth: 0 }}
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

                  <View className="ml-2 flex-col justify-between">
                    <TouchableOpacity
                      className={`p-1 rounded mb-1 items-center justify-center ${i === 0 ? 'bg-neutral-800 opacity-50' : 'bg-neutral-700'}`}
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
                      <Text className="text-white text-[10px]">▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className={`p-1 rounded items-center justify-center ${i === editingPins.length - 1 ? 'bg-neutral-800 opacity-50' : 'bg-neutral-700'}`}
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
                      <Text className="text-white text-[10px]">▼</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    className="ml-2 bg-red-900/50 p-2 rounded-lg items-center justify-center h-full"
                    style={{ minHeight: 48 }}
                    onPress={() => {
                      const newPins = editingPins.filter((_: any, index: number) => index !== i);
                      setEditingPins(newPins);
                    }}
                  >
                    <Text className="text-red-500 font-bold">✕</Text>
                  </TouchableOpacity>
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

                {editingPins && editingPins.length >= 4 && !hasSelfIntersection(editingPins.map((p: any) => ({ ...p, lat: parseFloat(p.lat) || 0, lon: parseFloat(p.lon) || 0 }))) && (
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
                      setGridPaintMode("safe");
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
        <View className="flex-1 bg-neutral-900 pt-16 px-4">
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
                <Text className="text-red-400 mb-4 font-bold text-center">Tracking: {target?.label}</Text>

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
                                  { translateX: mapTransform.translateX },
                                  { translateY: mapTransform.translateY },
                                  { scale: mapTransform.scale }
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
              <View className="flex-row mb-6 bg-neutral-800 rounded-xl p-1">
                <TouchableOpacity
                  className={`flex-1 py-3 rounded-lg items-center ${mapEditorStep === 1 ? 'bg-neutral-700 shadow' : ''}`}
                  onPress={() => setMapEditorStep(1)}
                >
                  <Text className={`font-bold ${mapEditorStep === 1 ? 'text-white' : 'text-neutral-400'}`}>Step 1: Calibrate</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`flex-1 py-3 rounded-lg items-center ${mapEditorStep === 2 ? 'bg-neutral-700 shadow' : ''}`}
                  onPress={() => setMapEditorStep(2)}
                >
                  <Text className={`font-bold ${mapEditorStep === 2 ? 'text-white' : 'text-neutral-400'}`}>Step 2: Safe Routes</Text>
                </TouchableOpacity>
              </View>

              {mapEditorStep === 1 ? (
                <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                  <Text className="text-neutral-400 text-sm mb-4">Select a GPS pin from the list below, then tap its matching corner on the floor plan.</Text>

                  <View className="flex-row flex-wrap mb-4 justify-center">
                    {selectedBuilding?.polygon?.map((p: any, i: number) => {
                      return (
                        <TouchableOpacity
                          key={i}
                          className={`px-3 py-2 rounded-lg border mr-2 mb-2 ${activeCalibIdx === i ? 'bg-blue-600 border-blue-400' : 'bg-neutral-800 border-neutral-600'}`}
                          onPress={() => setActiveCalibIdx(activeCalibIdx === i ? -1 : i)}
                        >
                          <Text className="text-white font-bold text-xs">{p.label || `P${i + 1}`}</Text>
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
                      <Text className="text-white font-bold">📍 Place Pin</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className={`flex-1 py-3 rounded-xl items-center border-2 ${step1PanMode ? 'bg-amber-600 border-amber-400' : 'bg-neutral-800 border-neutral-700'}`}
                      onPress={() => setStep1PanMode(true)}
                    >
                      <Text className="text-white font-bold">✋ Pan</Text>
                    </TouchableOpacity>
                  </View>

                  <View className="flex-row justify-end space-x-2 mb-4">
                    <Text className="text-white my-auto font-bold mr-2">Zoom:</Text>
                    <TouchableOpacity
                      className="bg-neutral-700 p-2 rounded-lg"
                      onPress={() => {
                        setStep1Zoom(z => Math.max(1, z - 0.5));
                        setStep1PanOffset({ x: 0, y: 0 });
                      }}
                    >
                      <MaterialCommunityIcons name="minus" size={24} color="white" />
                    </TouchableOpacity>
                    <Text className="text-white my-auto font-bold">{Math.round(step1Zoom * 100)}%</Text>
                    <TouchableOpacity
                      className="bg-neutral-700 p-2 rounded-lg"
                      onPress={() => {
                        setStep1Zoom(z => Math.min(5, z + 0.5));
                        setStep1PanOffset({ x: 0, y: 0 });
                      }}
                    >
                      <MaterialCommunityIcons name="plus" size={24} color="white" />
                    </TouchableOpacity>
                  </View>

                  <View
                    className="bg-neutral-800 rounded-xl overflow-hidden mb-6 w-full relative"
                    style={{ height: getDynamicMapHeight() * 1.3 }}
                    onLayout={(e) => setImgLayout({ w: Math.max(1, e.nativeEvent.layout.width), h: Math.max(1, e.nativeEvent.layout.height) })}
                  >
                    {selectedBuilding?.masterPlanUrl && (
                      <View
                        className="w-full h-full justify-center items-center"
                        onStartShouldSetResponder={() => true}
                        onResponderGrant={(e) => handleTouchStart(e, step1Zoom, step1PanOffset, step1PanMode, handleStep1Paint)}
                        onResponderMove={(e) => handleTouchMove(e, step1Zoom, setStep1Zoom, setStep1PanOffset, step1PanMode, handleStep1Paint)}
                      >
                        <View
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            width: imgLayout.w,
                            height: imgLayout.h,
                            transform: [
                              { translateX: step1PanOffset.x },
                              { translateY: step1PanOffset.y },
                              { scale: step1Zoom }
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
                                className="absolute items-center"
                                style={{ left: px - 20, top: py - 40, width: 40, height: 40, zIndex: activeCalibIdx === i ? 10 : 1 }}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  setActiveCalibIdx(activeCalibIdx === i ? -1 : i);
                                }}
                              >
                                {activeCalibIdx === i ? (
                                  <View className="absolute pointer-events-none" style={{ left: 4, top: 24, width: 32, height: 32 }}>
                                    <View className="absolute bg-red-500 shadow-md shadow-black" style={{ left: 15, top: 0, width: 2, height: 12 }} />
                                    <View className="absolute bg-red-500 shadow-md shadow-black" style={{ left: 15, bottom: 0, width: 2, height: 12 }} />
                                    <View className="absolute bg-red-500 shadow-md shadow-black" style={{ top: 15, left: 0, width: 12, height: 2 }} />
                                    <View className="absolute bg-red-500 shadow-md shadow-black" style={{ top: 15, right: 0, width: 12, height: 2 }} />
                                  </View>
                                ) : (
                                  <>
                                    <MaterialCommunityIcons
                                      name="map-marker"
                                      size={40}
                                      color="#22c55e"
                                    />
                                    <Text className="text-white text-[10px] font-bold absolute top-2">{labelShort}</Text>
                                  </>
                                )}
                                {activeCalibIdx === i && (() => {
                                  const screenX = (px - imgLayout.w / 2) * step1Zoom + step1PanOffset.x + imgLayout.w / 2;
                                  const screenY = (py - imgLayout.h / 2) * step1Zoom + step1PanOffset.y + imgLayout.h / 2;
                                  const dpadBaseLeft = screenX > imgLayout.w - 100 ? -75 : 35;
                                  const dpadBaseTop = screenY < 80 ? 40 : (screenY > imgLayout.h - 100 ? -80 : -20);
                                  return (
                                    <View className="absolute bg-neutral-900/90 rounded-full border border-neutral-600 shadow-xl z-50 flex-row items-center justify-center" style={{ width: 80, height: 80, left: (dpadBaseLeft + 20) / step1Zoom - 20, top: (dpadBaseTop + 20) / step1Zoom - 20, transform: [{ scale: 1 / step1Zoom }] }}>
                                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleNudgeCalib(i, 0, -1); }} className="absolute top-1 p-1 bg-neutral-700 rounded-full"><MaterialCommunityIcons name="chevron-up" size={20} color="white" /></TouchableOpacity>
                                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleNudgeCalib(i, 0, 1); }} className="absolute bottom-1 p-1 bg-neutral-700 rounded-full"><MaterialCommunityIcons name="chevron-down" size={20} color="white" /></TouchableOpacity>
                                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleNudgeCalib(i, -1, 0); }} className="absolute left-1 p-1 bg-neutral-700 rounded-full"><MaterialCommunityIcons name="chevron-left" size={20} color="white" /></TouchableOpacity>
                                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleNudgeCalib(i, 1, 0); }} className="absolute right-1 p-1 bg-neutral-700 rounded-full"><MaterialCommunityIcons name="chevron-right" size={20} color="white" /></TouchableOpacity>
                                      <View className="w-2 h-2 bg-neutral-500 rounded-full" />
                                    </View>
                                  );
                                })()}
                              </TouchableOpacity>
                            )
                          })}
                        </View>
                      </View>
                    )}
                  </View>

                  <View className="flex-row justify-between mb-4">
                    <TouchableOpacity className="bg-neutral-700 px-6 py-3 rounded-xl flex-1 mr-2 items-center" onPress={() => { setCalibPoints([]); setActiveCalibIdx(0); }}>
                      <Text className="text-white font-bold">Clear Points</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className={`px-6 py-3 rounded-xl flex-1 ml-2 items-center bg-green-600`}
                      onPress={async () => {
                        try {
                          if (calibPoints.filter(Boolean).length !== selectedBuilding?.polygon?.length) {
                            showToast("Please place all GPS pins on the map first to calibrate.");
                            return;
                          }
                          await updateBuildingCalibration({ clerkId: user?.id || "", buildingId: selectedBuilding._id, calibrationPoints: calibPoints });
                          setMapEditorStep(2);
                          showToast("Image calibrated successfully!");
                        } catch (e) { showToast("Error saving calibration", "error"); }
                      }}
                    >
                      <Text className="text-white font-bold">Next: Safe Routes ➔</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              ) : (
                <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                  <Text className="text-neutral-400 text-sm mb-4">Select a brush type, then tap the map to paint grid cells (5x5m).</Text>

                  {/* Toolbar */}
                  <View className="flex-row space-x-2 mb-2">
                    <TouchableOpacity
                      className={`flex-1 py-3 rounded-xl items-center border-2 ${gridPaintMode === "safe" ? 'bg-blue-600 border-blue-400' : 'bg-neutral-800 border-neutral-700'}`}
                      onPress={() => setGridPaintMode("safe")}
                    >
                      <Text className="text-white font-bold">🟦 Safe Route</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className={`flex-1 py-3 rounded-xl items-center border-2 ${gridPaintMode === "exit" ? 'bg-green-600 border-green-400' : 'bg-neutral-800 border-neutral-700'}`}
                      onPress={() => setGridPaintMode("exit")}
                    >
                      <Text className="text-white font-bold">🚪 Exit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className={`flex-1 py-3 rounded-xl items-center border-2 ${gridPaintMode === "erase" ? 'bg-red-600 border-red-400' : 'bg-neutral-800 border-neutral-700'}`}
                      onPress={() => setGridPaintMode("erase")}
                    >
                      <Text className="text-white font-bold">🧹 Erase</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className={`flex-1 py-3 rounded-xl items-center border-2 ${gridPaintMode === "pan" ? 'bg-amber-600 border-amber-400' : 'bg-neutral-800 border-neutral-700'}`}
                      onPress={() => setGridPaintMode("pan")}
                    >
                      <Text className="text-white font-bold">✋ Pan</Text>
                    </TouchableOpacity>
                  </View>

                  <View className="flex-row justify-end space-x-2 mb-4">
                    <Text className="text-white my-auto font-bold mr-2">Zoom:</Text>
                    <TouchableOpacity
                      className="bg-neutral-700 p-2 rounded-lg"
                      onPress={() => {
                        setUserZoom(z => Math.max(1, z - 0.5));
                        setMapPanOffset({ x: 0, y: 0 });
                      }}
                    >
                      <MaterialCommunityIcons name="minus" size={24} color="white" />
                    </TouchableOpacity>
                    <Text className="text-white my-auto font-bold">{Math.round(userZoom * 100)}%</Text>
                    <TouchableOpacity
                      className="bg-neutral-700 p-2 rounded-lg"
                      onPress={() => {
                        setUserZoom(z => Math.min(5, z + 0.5));
                        setMapPanOffset({ x: 0, y: 0 });
                      }}
                    >
                      <MaterialCommunityIcons name="plus" size={24} color="white" />
                    </TouchableOpacity>
                  </View>

                  <View
                    className="bg-neutral-800 rounded-xl mb-4 w-full justify-center items-center relative overflow-hidden"
                    style={{ height: getDynamicMapHeight() }}
                    onLayout={(e) => setImgLayout({ w: Math.max(1, e.nativeEvent.layout.width), h: Math.max(1, e.nativeEvent.layout.height) })}
                  >
                    {selectedBuilding?.masterPlanUrl && (
                      <View
                        className="w-full h-full justify-center items-center"
                        onStartShouldSetResponder={() => true}
                        onResponderGrant={(e) => handleTouchStart(e, userZoom, mapPanOffset, gridPaintMode === "pan", handleGridInteraction)}
                        onResponderMove={(e) => handleTouchMove(e, userZoom, setUserZoom, setMapPanOffset, gridPaintMode === "pan", handleGridInteraction)}
                      >
                        <View
                          style={{
                            width: getMapTransform().maskW,
                            height: getMapTransform().maskH,
                            overflow: 'hidden',
                            position: 'relative',
                            backgroundColor: '#171717'
                          }}
                          pointerEvents="none"
                        >
                          <View
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              width: imgLayout.w,
                              height: imgLayout.h,
                              transform: [
                                { translateX: getMapTransform().translateX },
                                { translateY: getMapTransform().translateY },
                                { scale: getMapTransform().scale }
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
                              const { rows, cols, minLat, maxLat, minLon, maxLon } = getGridDimensions();
                              const cells = [];
                              for (let r = 0; r < rows; r++) {
                                for (let c = 0; c < cols; c++) {
                                  const latCenter = maxLat - ((r + 0.5) * (maxLat - minLat) / rows);
                                  const lonCenter = minLon + ((c + 0.5) * (maxLon - minLon) / cols);
                                  const pu = mapGPSToImage(latCenter, lonCenter);
                                  if (!pu) continue;

                                  const bounds = getRenderedImageBounds();
                                  const isLegacy = pu.x > 2;
                                  const sx = isLegacy ? pu.x : bounds.offsetX + pu.x * bounds.renderW;
                                  const sy = isLegacy ? pu.y : bounds.offsetY + pu.y * bounds.renderH;

                                  const cellTopLeft = mapGPSToImage(maxLat - (r * (maxLat - minLat) / rows), minLon + (c * (maxLon - minLon) / cols));
                                  const cellBottomRight = mapGPSToImage(maxLat - ((r + 1) * (maxLat - minLat) / rows), minLon + ((c + 1) * (maxLon - minLon) / cols));

                                  let cellW = 20;
                                  let cellH = 20;

                                  if (cellTopLeft && cellBottomRight) {
                                    const tlX = isLegacy ? cellTopLeft.x : bounds.offsetX + cellTopLeft.x * bounds.renderW;
                                    const brX = isLegacy ? cellBottomRight.x : bounds.offsetX + cellBottomRight.x * bounds.renderW;
                                    const tlY = isLegacy ? cellTopLeft.y : bounds.offsetY + cellTopLeft.y * bounds.renderH;
                                    const brY = isLegacy ? cellBottomRight.y : bounds.offsetY + cellBottomRight.y * bounds.renderH;
                                    cellW = Math.max(10, Math.abs(brX - tlX));
                                    cellH = Math.max(10, Math.abs(brY - tlY));
                                  }

                                  const paintedCell = gridPaths.find(p => p.row === r && p.col === c);

                                  cells.push(
                                    <View
                                      key={`grid-${r}-${c}`}
                                      className={`absolute items-center justify-center border ${paintedCell
                                        ? (paintedCell.isExit ? 'bg-green-500/50 border-green-400' : 'bg-blue-500/50 border-blue-400')
                                        : 'border-neutral-500/10'
                                        }`}
                                      style={{
                                        left: sx - (cellW / 2),
                                        top: sy - (cellH / 2),
                                        width: cellW,
                                        height: cellH,
                                        zIndex: paintedCell?.isExit ? 10 : 1
                                      }}
                                      pointerEvents="none"
                                    >
                                      {paintedCell?.isExit && <Text className="text-white text-[8px] font-bold">E</Text>}
                                    </View>
                                  );
                                }
                              }
                              return cells;
                            })()}
                          </View>
                        </View>
                      </View>
                    )}
                  </View>

                  <View className="bg-blue-900/30 p-4 rounded-xl border border-blue-600/50 mb-6 flex-row">
                    <Text className="text-blue-500 mr-3 text-2xl">💡</Text>
                    <View className="flex-1">
                      <Text className="text-blue-400 font-bold mb-1 uppercase tracking-wider text-xs">Grid Strategy</Text>
                      <Text className="text-blue-300 text-xs">Paint <Text className="font-bold text-white">Safe Routes</Text> along corridors and rooms to define where users can walk. Mark <Text className="font-bold text-white">Exits</Text> at the doors. The system automatically calculates the shortest path through painted routes.</Text>
                    </View>
                  </View>

                  <View className="flex-row justify-between mb-4">
                    <TouchableOpacity className="flex-1 bg-neutral-700 py-3 rounded-xl items-center mr-2" onPress={() => setGridPaths([])}>
                      <Text className="text-white font-bold">Clear Grid</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="flex-1 bg-green-600 py-3 rounded-xl items-center"
                      onPress={async () => {
                        if (calibPoints.filter(Boolean).length !== selectedBuilding?.polygon?.length) {
                          showToast("Please complete Step 1 (Calibration) before saving.");
                          setMapEditorStep(1);
                          return;
                        }
                        if (!gridPaths.some(p => p.isExit)) {
                          showToast("Please paint at least one Exit.");
                          return;
                        }

                        try {
                          await updateBuildingGridPaths({ clerkId: user?.id || "", buildingId: selectedBuilding._id, gridPaths });
                          setIsMapEditorOpen(false);
                          showToast("Grid Layout saved!");
                        } catch (e) { showToast("Error saving grid", "error"); }
                      }}
                    >
                      <Text className="text-white font-bold">Save Grid</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              )}
            </>
          )}
        </View>
      </Modal>

      {/* Manage Site Modal */}
      <Modal visible={manageSiteName !== null} animationType="slide" presentationStyle="pageSheet">
        {manageSiteName && (
          <ScrollView className="flex-1 bg-neutral-900 pt-12 px-6">
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

          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
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
