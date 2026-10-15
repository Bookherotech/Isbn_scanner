import { lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { AdminLayout } from '../components/layout/AdminLayout'
import { StaffLayout } from '../components/layout/StaffLayout'

const Login = lazy(() => import('../pages/auth/Login'))

const Dashboard = lazy(() => import('../pages/admin/Dashboard'))
const Pending = lazy(() => import('../pages/admin/Pending'))
const ReviewBook = lazy(() => import('../pages/admin/ReviewBook'))
const WaitingList = lazy(() => import('../pages/admin/WaitingList'))
const Approved = lazy(() => import('../pages/admin/Approved'))
const Rejected = lazy(() => import('../pages/admin/Rejected'))
const LiveInventory = lazy(() => import('../pages/admin/LiveInventory'))
const BookDetail = lazy(() => import('../pages/admin/BookDetail'))
const Shelves = lazy(() => import('../pages/admin/Shelves'))
const Flags = lazy(() => import('../pages/admin/Flags'))
const StaffAdmin = lazy(() => import('../pages/admin/Staff'))
const AdminNotifications = lazy(() => import('../pages/admin/Notifications'))
const ActivityLog = lazy(() => import('../pages/admin/Activity'))
const Reports = lazy(() => import('../pages/admin/Reports'))
const Settings = lazy(() => import('../pages/admin/Settings'))

const StaffHome = lazy(() => import('../pages/staff/Home'))
const Scan = lazy(() => import('../pages/staff/Scan'))
const ManualIsbn = lazy(() => import('../pages/staff/ManualIsbn'))
const BookMetadata = lazy(() => import('../pages/staff/BookMetadata'))
const ShelfQuantity = lazy(() => import('../pages/staff/ShelfQuantity'))
const ReviewSubmit = lazy(() => import('../pages/staff/ReviewSubmit'))
const Submissions = lazy(() => import('../pages/staff/Submissions'))
const SubmissionDetail = lazy(() => import('../pages/staff/SubmissionDetail'))
const StaffNotifications = lazy(() => import('../pages/staff/Notifications'))
const Profile = lazy(() => import('../pages/staff/Profile'))

function RequireRole({ role, children }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/staff'} replace />
  return children
}

function Home() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'admin' ? '/admin' : '/staff'} replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />

      <Route
        path="/admin"
        element={
          <RequireRole role="admin">
            <AdminLayout />
          </RequireRole>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="pending" element={<Pending />} />
        <Route path="pending/:id" element={<ReviewBook />} />
        <Route path="waiting-list" element={<WaitingList />} />
        <Route path="approved" element={<Approved />} />
        <Route path="rejected" element={<Rejected />} />
        <Route path="live" element={<LiveInventory />} />
        <Route path="out-of-stock" element={<Navigate to="/admin/waiting-list?tab=stock" replace />} />
        <Route path="books/:id" element={<BookDetail />} />
        <Route path="flags" element={<Flags />} />
        <Route path="shelves" element={<Shelves />} />
        <Route path="staff" element={<StaffAdmin />} />
        <Route path="notifications" element={<AdminNotifications />} />
        <Route path="activity" element={<ActivityLog />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>

      <Route
        path="/staff"
        element={
          <RequireRole role="staff">
            <StaffLayout />
          </RequireRole>
        }
      >
        <Route index element={<StaffHome />} />
        <Route path="scan" element={<Scan />} />
        <Route path="manual-isbn" element={<ManualIsbn />} />
        <Route path="book/:isbn" element={<BookMetadata />} />
        <Route path="shelf" element={<ShelfQuantity />} />
        <Route path="review" element={<ReviewSubmit />} />
        <Route path="submissions" element={<Submissions />} />
        <Route path="submissions/:id" element={<SubmissionDetail />} />
        <Route path="notifications" element={<StaffNotifications />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/staff" replace />} />
      </Route>

      <Route path="*" element={<Home />} />
    </Routes>
  )
}
