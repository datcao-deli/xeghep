import LandingPage from './LandingPage';

/**
 * Trang HomeAuth (legacy) chuyển tiếp đồng bộ sang LandingPage với Auth Modal mở sẵn.
 * Tránh tình trạng phân mảnh giao diện hoặc kẹt giao diện cũ khi người dùng truy cập /login.
 */
export default function HomeAuth() {
  return <LandingPage defaultAuthOpen={true} defaultAuthMode="login" />;
}
