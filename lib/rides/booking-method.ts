// Human label for how a ride was booked, derived from hmu_posts.post_type.
// Shared by the rider/driver history endpoint and the admin rides endpoint so
// the label stays consistent across the app.
export function bookingMethod(postType: string | null): string {
  switch (postType) {
    case 'blast':
    case 'rider_seeking_driver':
      return 'Blast';
    case 'down_bad':
      return 'Down Bad';
    case 'direct_booking':
    case 'rider_request':
      return 'Direct';
    default:
      return 'Direct';
  }
}
