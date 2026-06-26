// Human label for how a ride was booked, derived from hmu_posts.post_type.
// Single source of truth shared by the rider/driver ride history and the admin
// rides history/detail endpoints so the label stays consistent app-wide.
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
