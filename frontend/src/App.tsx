import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import type { LatLngExpression, LeafletMouseEvent } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

type Plantation = {
  id: number
  name: string
  location: string
  area_hectares: number
  dominant_species: string | null
  planting_date: string | null
  latitude: number | null
  longitude: number | null
  created_at?: string
}

type PlantationForm = {
  name: string
  location: string
  area_hectares: string
  dominant_species: string
  planting_date: string
  latitude: string
  longitude: string
}

// FastAPI backend base URL.
const API_URL = 'http://127.0.0.1:8000'

const INDIA_CENTER: LatLngExpression = [22.9734, 78.6569]

// Approximate city coordinates are used only when exact coordinates
// have not been saved for an existing plantation.
const CITY_COORDINATES: Record<string, [number, number]> = {
  delhi: [28.6139, 77.209],
  noida: [28.5355, 77.391],
  'greater noida': [28.4744, 77.504],
  chandigarh: [30.7333, 76.7794],
  lucknow: [26.8467, 80.9462],
  dehradun: [30.3165, 78.0322],
  shimla: [31.1048, 77.1734],
  jaipur: [26.9124, 75.7873],
  mumbai: [19.076, 72.8777],
  pune: [18.5204, 73.8567],
  bengaluru: [12.9716, 77.5946],
  bangalore: [12.9716, 77.5946],
  chennai: [13.0827, 80.2707],
  hyderabad: [17.385, 78.4867],
  kolkata: [22.5726, 88.3639],
  patna: [25.5941, 85.1376],
  bhopal: [23.2599, 77.4126],
  indore: [22.7196, 75.8577],
  agra: [27.1767, 78.0081],
  varanasi: [25.3176, 82.9739],
  kanpur: [26.4499, 80.3319],
  gurugram: [28.4595, 77.0266],
  gurgaon: [28.4595, 77.0266],
  amritsar: [31.634, 74.8723],
  ludhiana: [30.901, 75.8573],
}

const initialForm: PlantationForm = {
  name: '',
  location: '',
  area_hectares: '',
  dominant_species: '',
  planting_date: '',
  latitude: '',
  longitude: '',
}

function getCityCoordinates(
  location: string,
): [number, number] | null {
  const normalized = location.trim().toLowerCase()

  const city = Object.keys(CITY_COORDINATES).find((name) =>
    normalized.includes(name),
  )

  return city ? CITY_COORDINATES[city] : null
}

function createPlantationIcon() {
  return L.divIcon({
    className: 'plantation-marker-wrapper',
    html: '<div class="plantation-marker"><span>🌳</span></div>',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -17],
  })
}

const plantationIcon = createPlantationIcon()

function MapResizer() {
  const map = useMap()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize()
    }, 200)

    return () => window.clearTimeout(timer)
  }, [map])

  return null
}

function MapClickPicker({
  enabled,
  onPick,
}: {
  enabled: boolean
  onPick: (latitude: number, longitude: number) => void
}) {
  useMapEvents({
    click(event: LeafletMouseEvent) {
      if (enabled) {
        onPick(
          Number(event.latlng.lat.toFixed(6)),
          Number(event.latlng.lng.toFixed(6)),
        )
      }
    },
  })

  return null
}

function PlantationMap({
  plantations,
  pickerEnabled = false,
  onPick,
  selectedCoordinates,
}: {
  plantations: Plantation[]
  pickerEnabled?: boolean
  onPick?: (latitude: number, longitude: number) => void
  selectedCoordinates?: [number, number] | null
}) {
  const mappedPlantations = useMemo(
    () =>
      plantations
        .map((plantation) => {
          const hasExactCoordinates =
            typeof plantation.latitude === 'number' &&
            typeof plantation.longitude === 'number'

          return {
            plantation,
            coordinates: hasExactCoordinates
              ? ([
                  plantation.latitude!,
                  plantation.longitude!,
                ] as [number, number])
              : getCityCoordinates(plantation.location),
            exact: hasExactCoordinates,
          }
        })
        .filter(
          (
            item,
          ): item is {
            plantation: Plantation
            coordinates: [number, number]
            exact: boolean
          } => item.coordinates !== null,
        ),
    [plantations],
  )

  return (
    <div className="map-shell">
      {pickerEnabled && (
        <div className="map-picker-hint">
          Click anywhere on the map to choose the plantation coordinates.
        </div>
      )}

      <MapContainer
        center={INDIA_CENTER}
        zoom={5}
        scrollWheelZoom
        className="plantation-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapResizer />

        {pickerEnabled && onPick && (
          <MapClickPicker
            enabled={pickerEnabled}
            onPick={onPick}
          />
        )}

        {mappedPlantations.map(
          ({ plantation, coordinates, exact }) => (
            <Marker
              key={plantation.id}
              position={coordinates}
              icon={plantationIcon}
            >
              <Popup>
                <div className="map-popup">
                  <strong>{plantation.name}</strong>

                  <p>📍 {plantation.location}</p>

                  <p>
                    🌱 Area:{' '}
                    {Number(
                      plantation.area_hectares,
                    ).toLocaleString()}{' '}
                    ha
                  </p>

                  <p>
                    🌳 Species:{' '}
                    {plantation.dominant_species ||
                      'Not specified'}
                  </p>

                  <p>
                    📅 Planting date:{' '}
                    {plantation.planting_date ||
                      'Not specified'}
                  </p>

                  <p>
                    Coordinates:{' '}
                    {coordinates[0].toFixed(6)},{' '}
                    {coordinates[1].toFixed(6)}
                  </p>

                  <small>
                    {exact
                      ? 'Exact saved coordinates'
                      : 'Approximate city-center marker; exact coordinates not saved'}
                  </small>
                </div>
              </Popup>
            </Marker>
          ),
        )}

        {selectedCoordinates && (
          <Marker
            position={selectedCoordinates}
            icon={plantationIcon}
          >
            <Popup>
              Selected location:{' '}
              {selectedCoordinates[0]},{' '}
              {selectedCoordinates[1]}
            </Popup>
          </Marker>
        )}
      </MapContainer>

      <div className="map-legend">
        <span className="legend-dot">🌳</span>
        <span>Plantation location</span>

        <span className="legend-dot">📍</span>
        <span>Selected location</span>
      </div>

      {mappedPlantations.length === 0 && !pickerEnabled && (
        <div className="map-empty-message">
          <span>📍</span>

          <strong>No recognized plantation locations</strong>

          <p>
            Register a plantation using a supported city name,
            or provide exact coordinates.
          </p>
        </div>
      )}

      <div className="map-count">
        {mappedPlantations.length} mapped location
        {mappedPlantations.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

function App() {
  const [plantations, setPlantations] = useState<Plantation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState<PlantationForm>(initialForm)
  const [mapPickerEnabled, setMapPickerEnabled] = useState(false)

  // DeepForest ML image-detection state.
  const [mlFile, setMlFile] = useState<File | null>(null)
  const [mlLoading, setMlLoading] = useState(false)
  const [mlError, setMlError] = useState('')
  const [mlResult, setMlResult] = useState<{
    success: boolean
    filename: string
    predicted_tree_count: number
    mean_confidence: number | null
    annotated_image_url: string
    note: string
  } | null>(null)

  const runTreeDetection = async () => {
    if (!mlFile) {
      setMlError('Please select an image first.')
      return
    }

    setMlLoading(true)
    setMlError('')
    setMlResult(null)

    const formData = new FormData()
    formData.append('file', mlFile)

    try {
      const response = await fetch(`${API_URL}/api/ml/predict`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === 'string'
            ? data.detail
            : `Tree detection failed (HTTP ${response.status}). Check the backend.`,
        )
      }

      setMlResult(data)
    } catch (error) {
      setMlError(
        error instanceof Error
          ? error.message
          : 'Unable to connect to the ML backend.',
      )
    } finally {
      setMlLoading(false)
    }
  }

  // Fetch plantation records from FastAPI.
  const loadPlantations = useCallback(async () => {
    try {
      setLoadError('')

      const response = await fetch(
        `${API_URL}/api/plantations`,
      )

      if (!response.ok) {
        throw new Error(
          `Server returned HTTP ${response.status}`,
        )
      }

      const data: Plantation[] = await response.json()

      setPlantations(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error(
        'Unable to load plantations:',
        error,
      )

      setLoadError(
        'Could not connect to the backend at 127.0.0.1:8000. Check that the FastAPI server is running and try again.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPlantations()
  }, [loadPlantations])

  // Calculate the total registered area.
  const totalArea = useMemo(
    () =>
      plantations.reduce(
        (total, plantation) =>
          total +
          (Number(plantation.area_hectares) || 0),
        0,
      ),
    [plantations],
  )

  // Feature 1: transparent, illustrative carbon-potential range.
  // This is a planning estimate only, not a verified carbon-removal measurement.
  const carbonPotential = useMemo(() => ({
    low: totalArea * 2,
    high: totalArea * 10,
  }), [totalArea])

  // Feature 2: audit plantation records for missing GPS, out-of-India coordinates,
  // and repeated records. This does not delete or modify any database records.
  const dataQuality = useMemo(() => {
    const missingGps = plantations.filter(
      (plantation) =>
        typeof plantation.latitude !== 'number' ||
        typeof plantation.longitude !== 'number',
    ).length

    const suspiciousGps = plantations.filter((plantation) => {
      if (
        typeof plantation.latitude !== 'number' ||
        typeof plantation.longitude !== 'number'
      ) return false

      // Broad India bounding box; this flags obvious coordinate mistakes,
      // but is not a precise border/geocoding validation.
      return (
        plantation.latitude < 6 || plantation.latitude > 38 ||
        plantation.longitude < 68 || plantation.longitude > 98
      )
    }).length

    const keyCounts = new Map<string, number>()
    plantations.forEach((plantation) => {
      const key = [
        plantation.name.trim().toLowerCase(),
        plantation.location.trim().toLowerCase(),
        Number(plantation.area_hectares).toFixed(3),
        (plantation.dominant_species || '').trim().toLowerCase(),
        plantation.planting_date || '',
      ].join('|')
      keyCounts.set(key, (keyCounts.get(key) || 0) + 1)
    })

    const duplicateGroups = [...keyCounts.values()].filter((count) => count > 1).length
    const extraDuplicateRecords = [...keyCounts.values()]
      .reduce((sum, count) => sum + Math.max(0, count - 1), 0)

    const coordinateCoverage = plantations.length
      ? Math.round(((plantations.length - missingGps) / plantations.length) * 100)
      : 0

    return {
      missingGps,
      suspiciousGps,
      duplicateGroups,
      extraDuplicateRecords,
      coordinateCoverage,
    }
  }, [plantations])

  // Search by plantation name, location, or tree species.
  const filteredPlantations = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) {
      return plantations
    }

    return plantations.filter((plantation) =>
      [
        plantation.name,
        plantation.location,
        plantation.dominant_species || '',
      ].some((value) =>
        value.toLowerCase().includes(query),
      ),
    )
  }, [plantations, search])

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { name, value } = event.target

    setForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  // Populate latitude and longitude when a user clicks the map.
  const handleMapPick = (
    latitude: number,
    longitude: number,
  ) => {
    setForm((current) => ({
      ...current,
      latitude: String(latitude),
      longitude: String(longitude),
    }))

    setSuccessMessage(
      `Map location selected: ${latitude}, ${longitude}`,
    )
  }

  // Validate and save a new plantation.
  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    setFormError('')
    setSuccessMessage('')

    const area = Number(form.area_hectares)
    const latitudeText = form.latitude.trim()
    const longitudeText = form.longitude.trim()

    if (
      !form.name.trim() ||
      !form.location.trim()
    ) {
      setFormError(
        'Please enter the plantation name and location.',
      )
      return
    }

    if (!Number.isFinite(area) || area <= 0) {
      setFormError(
        'Area must be a number greater than zero.',
      )
      return
    }

    if (
      Boolean(latitudeText) !==
      Boolean(longitudeText)
    ) {
      setFormError(
        'Enter both latitude and longitude, or leave both empty.',
      )
      return
    }

    let latitude: number | null = null
    let longitude: number | null = null

    if (latitudeText && longitudeText) {
      latitude = Number(latitudeText)
      longitude = Number(longitudeText)

      if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90
      ) {
        setFormError(
          'Latitude must be between -90 and 90.',
        )
        return
      }

      if (
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        setFormError(
          'Longitude must be between -180 and 180.',
        )
        return
      }
    }

    setSubmitting(true)

    try {
      const response = await fetch(
        `${API_URL}/api/plantations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: form.name.trim(),
            location: form.location.trim(),
            area_hectares: area,
            dominant_species:
              form.dominant_species.trim() || null,
            planting_date:
              form.planting_date || null,
            latitude,
            longitude,
          }),
        },
      )

      const responseData = await response
        .json()
        .catch(() => null)

      if (!response.ok) {
        const detail = responseData?.detail

        throw new Error(
          typeof detail === 'string'
            ? detail
            : `Unable to register plantation (HTTP ${response.status}).`,
        )
      }

      setForm({ ...initialForm })
      setShowForm(false)
      setMapPickerEnabled(false)

      setSuccessMessage(
        'Plantation registered successfully!',
      )

      await loadPlantations()
    } catch (error) {
      console.error(
        'Unable to register plantation:',
        error,
      )

      setFormError(
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  // Count records with precise coordinates.
  const exactCoordinateCount = plantations.filter(
    (plantation) =>
      typeof plantation.latitude === 'number' &&
      typeof plantation.longitude === 'number',
  ).length

  // Count unique locations that can be displayed on the map.
  const mappedLocationCount = new Set(
    plantations
      .map((plantation) => {
        if (
          typeof plantation.latitude === 'number' &&
          typeof plantation.longitude === 'number'
        ) {
          return `${plantation.latitude},${plantation.longitude}`
        }

        const coordinates = getCityCoordinates(
          plantation.location,
        )

        return coordinates
          ? coordinates.join(',')
          : null
      })
      .filter(
        (value): value is string =>
          value !== null,
      ),
  ).size

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">🌿</div>

          <div>
            <h1>ForestIQ AI</h1>
            <span>FOREST INTELLIGENCE</span>
          </div>
        </div>

        <div className="sidebar-label">
          WORKSPACE
        </div>

        <nav className="sidebar-nav">
          <a
            className="nav-item active"
            href="#dashboard"
          >
            <span>▦</span>
            Dashboard
          </a>

          <a
            className="nav-item"
            href="#map"
          >
            <span>◎</span>
            Plantation Map
          </a>

          <a
            className="nav-item"
            href="#plantations"
          >
            <span>♧</span>
            Plantations
          </a>

          <a
            className="nav-item"
            href="#registration"
            onClick={() => setShowForm(true)}
          >
            <span>＋</span>
            Register Plantation
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="status-indicator" />

          <div>
            <strong>System status</strong>

            <span>
              {loadError
                ? 'Backend disconnected'
                : loading
                  ? 'Connecting to backend...'
                  : 'Monitoring ready'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main dashboard */}
      <main
        className="main-content"
        id="dashboard"
      >
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              Workspace / Dashboard
            </div>

            <h2>Afforestation Dashboard</h2>

            <p>
              Monitor plantations and manage your
              green assets.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={() => {
              setShowForm((current) => !current)
              setFormError('')
              setSuccessMessage('')

              if (!showForm) {
                window.setTimeout(() => {
                  document
                    .getElementById('registration')
                    ?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    })
                }, 50)
              }
            }}
          >
            {showForm
              ? '✕ Close form'
              : '+ Register plantation'}
          </button>
        </header>

        {/* Backend error */}
        {loadError && (
          <div className="alert error-alert">
            <strong>
              Backend connection issue
            </strong>

            <p>{loadError}</p>

            <button
              className="text-button"
              onClick={() => {
                setLoading(true)
                void loadPlantations()
              }}
            >
              Retry connection
            </button>
          </div>
        )}

        {/* Success message */}
        {successMessage && (
          <div className="alert success-alert">
            {successMessage}
          </div>
        )}

        {/* Registration form */}
        {showForm && (
          <section
            className="panel registration-panel"
            id="registration"
          >
            <div className="panel-heading">
              <div>
                <span className="eyebrow">
                  NEW RECORD
                </span>

                <h3>
                  Register a plantation
                </h3>

                <p>
                  Add plantation details and choose
                  its exact map location.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              className="plantation-form"
            >
              <label>
                Plantation name <span>*</span>

                <input
                  name="name"
                  value={form.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Green Valley Plantation"
                  required
                />
              </label>

              <label>
                Location / address <span>*</span>

                <input
                  name="location"
                  value={form.location}
                  onChange={handleInputChange}
                  placeholder="e.g. Sector 62, Noida, Uttar Pradesh"
                  required
                />
              </label>

              <label>
                Area (hectares) <span>*</span>

                <input
                  name="area_hectares"
                  type="number"
                  min="0.01"
                  step="any"
                  value={form.area_hectares}
                  onChange={handleInputChange}
                  placeholder="e.g. 25.5"
                  required
                />
              </label>

              <label>
                Dominant tree species

                <input
                  name="dominant_species"
                  value={form.dominant_species}
                  onChange={handleInputChange}
                  placeholder="e.g. Neem, Teak"
                />
              </label>

              <label>
                Planting date

                <input
                  name="planting_date"
                  type="date"
                  value={form.planting_date}
                  onChange={handleInputChange}
                />
              </label>

              <label>
                Latitude

                <input
                  name="latitude"
                  type="number"
                  min="-90"
                  max="90"
                  step="any"
                  value={form.latitude}
                  onChange={handleInputChange}
                  placeholder="e.g. 28.613900"
                />
              </label>

              <label>
                Longitude

                <input
                  name="longitude"
                  type="number"
                  min="-180"
                  max="180"
                  step="any"
                  value={form.longitude}
                  onChange={handleInputChange}
                  placeholder="e.g. 77.209000"
                />
              </label>

              <div className="coordinate-help">
                Enter coordinates manually or click the
                map below to fill them automatically.
              </div>

              <div className="map-picker-section">
                <div className="map-picker-toolbar">
                  <strong>
                    Select location on map
                  </strong>

                  <button
                    type="button"
                    className={
                      mapPickerEnabled
                        ? 'secondary-button picker-active'
                        : 'secondary-button'
                    }
                    onClick={() =>
                      setMapPickerEnabled(
                        (enabled) => !enabled,
                      )
                    }
                  >
                    {mapPickerEnabled
                      ? '✓ Map selection enabled'
                      : '📍 Choose on map'}
                  </button>
                </div>

                <div className="picker-map-container">
                  <PlantationMap
                    plantations={[]}
                    pickerEnabled={mapPickerEnabled}
                    onPick={handleMapPick}
                    selectedCoordinates={
                      form.latitude.trim() !== '' &&
                      form.longitude.trim() !== '' &&
                      Number.isFinite(
                        Number(form.latitude),
                      ) &&
                      Number.isFinite(
                        Number(form.longitude),
                      )
                        ? [
                            Number(form.latitude),
                            Number(form.longitude),
                          ]
                        : null
                    }
                  />
                </div>

                {mapPickerEnabled && (
                  <small className="coordinate-help">
                    Click the map at the plantation's
                    location. The latitude and longitude
                    fields will update.
                  </small>
                )}
              </div>

              {formError && (
                <div className="form-error">
                  {formError}
                </div>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setShowForm(false)
                    setFormError('')
                    setMapPickerEnabled(false)
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={submitting}
                >
                  {submitting
                    ? 'Registering...'
                    : 'Save plantation'}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* DeepForest ML tree detection */}
        <section
          className="panel"
          id="tree-detection"
          style={{ marginBottom: 24, padding: 24 }}
        >
          <div className="panel-heading">
            <div>
              <span className="eyebrow">COMPUTER VISION</span>
              <h3>AI Tree Detection</h3>
              <p>
                Upload an aerial or forest image to detect and count tree
                canopies using the DeepForest model.
              </p>
            </div>
          </div>

          <div
            style={{
              padding: 20,
              border: '1px dashed #86a98b',
              borderRadius: 12,
              background: '#f7fbf7',
            }}
          >
            <label
              htmlFor="tree-image"
              style={{ display: 'block', fontWeight: 600, marginBottom: 12 }}
            >
              Select forest image
            </label>

            <input
              id="tree-image"
              type="file"
              accept=".jpg,.jpeg,.png,.tif,.tiff"
              onChange={(event) => {
                setMlFile(event.target.files?.[0] ?? null)
                setMlResult(null)
                setMlError('')
              }}
            />

            {mlFile && (
              <p style={{ marginTop: 10 }}>
                Selected: {mlFile.name}
              </p>
            )}

            <button
              type="button"
              className="primary-button"
              style={{ marginTop: 16 }}
              disabled={!mlFile || mlLoading}
              onClick={() => void runTreeDetection()}
            >
              {mlLoading ? 'Analyzing image...' : '🌳 Detect Trees'}
            </button>

            {mlLoading && (
              <p style={{ marginTop: 12 }}>
                Running DeepForest prediction. The first request may take longer
                while the model loads.
              </p>
            )}

            {mlError && (
              <div
                role="alert"
                style={{ color: '#b42318', marginTop: 16 }}
              >
                {mlError}
              </div>
            )}
          </div>

          {mlResult && (
            <div style={{ marginTop: 24 }}>
              <div className="stats-grid">
                <article className="stat-card">
                  <span className="stat-caption">PREDICTED TREES</span>
                  <h3>
                    {mlResult.predicted_tree_count.toLocaleString()}
                  </h3>
                  <span className="stat-foot">
                    Estimated detections in the uploaded image
                  </span>
                </article>

                <article className="stat-card">
                  <span className="stat-caption">MEAN CONFIDENCE</span>
                  <h3>
                    {mlResult.mean_confidence == null
                      ? 'N/A'
                      : `${(mlResult.mean_confidence * 100).toFixed(1)}%`}
                  </h3>
                  <span className="stat-foot">
                    Reported by the detection model
                  </span>
                </article>
              </div>

              <h4 style={{ marginTop: 24 }}>Detection Results</h4>
              <img
                src={`${API_URL}${mlResult.annotated_image_url}`}
                alt="Image annotated with AI tree detections"
                style={{
                  display: 'block',
                  width: '100%',
                  maxWidth: 900,
                  maxHeight: 600,
                  objectFit: 'contain',
                  borderRadius: 12,
                  border: '1px solid #ddd',
                  marginTop: 12,
                }}
              />
              <p style={{ marginTop: 12 }}>{mlResult.note}</p>
            </div>
          )}
        </section>

        {/* Dashboard statistics */}
        <section className="stats-grid">
          <article className="stat-card">
            <div className="stat-top">
              <span className="stat-icon green">
                ♧
              </span>

              <span className="stat-caption">
                REGISTERED
              </span>
            </div>

            <p>Total plantations</p>

            <h3>
              {loading
                ? '—'
                : plantations.length.toLocaleString()}
            </h3>

            <span className="stat-foot">
              Records in the database
            </span>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span className="stat-icon blue">
                ⌖
              </span>

              <span className="stat-caption">
                LAND COVERAGE
              </span>
            </div>

            <p>Total registered area</p>

            <h3>
              {loading
                ? '—'
                : totalArea.toLocaleString(
                    undefined,
                    {
                      maximumFractionDigits: 2,
                    },
                  )}

              <span className="stat-unit">
                {' '}ha
              </span>
            </h3>

            <span className="stat-foot">
              Combined plantation area
            </span>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span className="stat-icon amber">
                ◎
              </span>

              <span className="stat-caption">
                GEOGRAPHIC
              </span>
            </div>

            <p>Mapped locations</p>

            <h3>
              {mappedLocationCount.toLocaleString()}
            </h3>

            <span className="stat-foot">
              {exactCoordinateCount} with exact
              coordinates
            </span>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span className="stat-icon purple">
                ↗
              </span>

              <span className="stat-caption">
                DATA STATUS
              </span>
            </div>

            <p>API connection</p>

            <h3 className="status-text">
              {loadError
                ? 'Offline'
                : loading
                  ? 'Connecting'
                  : 'Connected'}
            </h3>

            <span className="stat-foot">
              ForestIQ AI backend
            </span>
          </article>
        </section>

        {/* New feature 1 + 2: carbon potential and data-quality audit */}
        <section
          className="stats-grid"
          aria-label="Carbon potential and plantation data quality"
          style={{ marginTop: 24, marginBottom: 24 }}
        >
          <article className="panel" style={{ padding: 24, gridColumn: 'span 2' }}>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">FEATURE 01 · CLIMATE IMPACT</span>
                <h3>Indicative carbon potential</h3>
                <p>Illustrative annual range based on registered plantation area.</p>
              </div>
              <span className="stat-icon green" aria-hidden="true">♻</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'baseline' }}>
              <strong style={{ fontSize: 28, color: '#176b45' }}>
                {loading ? '—' : `${carbonPotential.low.toLocaleString(undefined, { maximumFractionDigits: 1 })}–${carbonPotential.high.toLocaleString(undefined, { maximumFractionDigits: 1 })}`}
              </strong>
              <span style={{ color: '#52665a' }}>tCO₂e / year · indicative only</span>
            </div>
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#f0f8f1', color: '#385a42', fontSize: 13, lineHeight: 1.55 }}>
              Uses a broad demonstration assumption of 2–10 tCO₂e per hectare per year. This is not measured sequestration, a certified carbon-credit calculation, or a substitute for species/age/field data and an approved methodology.
            </div>
          </article>

          <article className="panel" style={{ padding: 24, gridColumn: 'span 2' }}>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">FEATURE 02 · DATA TRUST</span>
                <h3>Plantation data-quality audit</h3>
                <p>Flags records that may need review. Nothing is changed automatically.</p>
              </div>
              <span className="stat-icon amber" aria-hidden="true">✓</span>
            </div>
            <div className="stats-grid" style={{ marginTop: 12 }}>
              <article className="stat-card">
                <span className="stat-caption">GPS COVERAGE</span>
                <h3>{loading ? '—' : `${dataQuality.coordinateCoverage}%`}</h3>
                <span className="stat-foot">{dataQuality.missingGps} record(s) missing exact coordinates</span>
              </article>
              <article className="stat-card">
                <span className="stat-caption">GPS REVIEW</span>
                <h3>{loading ? '—' : dataQuality.suspiciousGps}</h3>
                <span className="stat-foot">Coordinate(s) outside a broad India bounding box</span>
              </article>
              <article className="stat-card">
                <span className="stat-caption">POSSIBLE DUPLICATES</span>
                <h3>{loading ? '—' : dataQuality.extraDuplicateRecords}</h3>
                <span className="stat-foot">Extra record(s) in matching name/location/area/species/date groups</span>
              </article>
            </div>
            {(dataQuality.suspiciousGps > 0 || dataQuality.extraDuplicateRecords > 0 || dataQuality.missingGps > 0) && !loading && (
              <div role="status" style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#fff8e8', color: '#79551b', fontSize: 13, lineHeight: 1.5 }}>
                Review recommended: add exact GPS coordinates where available, verify flagged coordinates against the stated location, and check possible duplicate records before using dashboard totals for reporting.
              </div>
            )}
          </article>
        </section>

        {/* Plantation monitoring map */}
        <section
          className="panel map-panel"
          id="map"
        >
          <div className="panel-heading map-heading">
            <div>
              <span className="eyebrow">
                GEOSPATIAL VIEW
              </span>

              <h3>
                Plantation monitoring map
              </h3>

              <p>
                Exact saved coordinates are preferred;
                older records use approximate city
                locations.
              </p>
            </div>

            <span className="live-badge">
              <span />

              {loadError
                ? 'API OFFLINE'
                : loading
                  ? 'CONNECTING'
                  : 'DATABASE VIEW'}
            </span>
          </div>

          <PlantationMap
            plantations={plantations}
          />
        </section>

        {/* Plantation records table */}
        <section
          className="panel table-panel"
          id="plantations"
        >
          <div className="panel-heading table-heading">
            <div>
              <span className="eyebrow">
                DATABASE
              </span>

              <h3>
                Plantation records
              </h3>

              <p>
                View and search your registered
                plantations.
              </p>
            </div>

            <div className="search-box">
              <span>⌕</span>

              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search plantations..."
                aria-label="Search plantations"
              />
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>PLANTATION</th>
                  <th>LOCATION</th>
                  <th>AREA</th>
                  <th>DOMINANT SPECIES</th>
                  <th>PLANTING DATE</th>
                  <th>COORDINATES</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="empty-table"
                    >
                      Loading plantation records...
                    </td>
                  </tr>
                ) : filteredPlantations.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="empty-table"
                    >
                      {search
                        ? 'No plantations match your search.'
                        : 'No plantations registered yet. Add your first plantation above.'}
                    </td>
                  </tr>
                ) : (
                  filteredPlantations.map(
                    (plantation) => {
                      const hasExact =
                        typeof plantation.latitude ===
                          'number' &&
                        typeof plantation.longitude ===
                          'number'

                      const approximate =
                        getCityCoordinates(
                          plantation.location,
                        )

                      return (
                        <tr key={plantation.id}>
                          <td>
                            <div className="plantation-name-cell">
                              <span className="table-tree">
                                🌳
                              </span>

                              <div>
                                <strong>
                                  {plantation.name}
                                </strong>

                                <small>
                                  Record #{plantation.id}
                                </small>
                              </div>
                            </div>
                          </td>

                          <td>
                            {plantation.location}
                          </td>

                          <td>
                            {Number(
                              plantation.area_hectares,
                            ).toLocaleString()}{' '}
                            ha
                          </td>

                          <td>
                            {plantation.dominant_species ||
                              '—'}
                          </td>

                          <td>
                            {plantation.planting_date ||
                              '—'}
                          </td>

                          <td>
                            <span
                              className={
                                hasExact
                                  ? 'map-status mapped'
                                  : 'map-status unavailable'
                              }
                            >
                              {hasExact
                                ? `${plantation.latitude!.toFixed(5)}, ${plantation.longitude!.toFixed(5)}`
                                : approximate
                                  ? 'Approximate city marker'
                                  : 'Not mapped'}
                            </span>
                          </td>
                        </tr>
                      )
                    },
                  )
                )}
              </tbody>
            </table>
          </div>

          <div className="table-footer">
            <span>
              Showing {filteredPlantations.length} of{' '}
              {plantations.length} records
            </span>

            <button
              className="text-button"
              onClick={() => {
                setLoading(true)
                void loadPlantations()
              }}
            >
              ↻ Refresh data
            </button>
          </div>
        </section>

        <footer className="footer">
          <span>🌿 ForestIQ AI</span>

          <span>
            Afforestation intelligence and plantation
            management
          </span>
        </footer>
      </main>
    </div>
  )
}

export default App