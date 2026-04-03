import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to login - authenticated users will be redirected to their tenant dashboard
  redirect('/login');
}
