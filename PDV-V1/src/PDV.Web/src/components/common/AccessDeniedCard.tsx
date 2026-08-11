import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Card, CardContent, Stack, Typography } from '@mui/material';

interface AccessDeniedCardProps {
  title: string;
  message: string;
}

export function AccessDeniedCard({ title, message }: AccessDeniedCardProps) {
  return (
    <Card sx={{ borderRadius: 5 }}>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <LockOutlinedIcon color="warning" />
            <Typography variant="h5">{title}</Typography>
          </Stack>
          <Typography color="text.secondary">{message}</Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
