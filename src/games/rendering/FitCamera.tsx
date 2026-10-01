import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Box3, OrthographicCamera, Vector3 } from 'three';

export function FitCamera({ bounds, offset = [6, 7, 9], padding = 1.35 }: {
  bounds: Box3; offset?: readonly [number, number, number]; padding?: number;
}) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    if (!(camera instanceof OrthographicCamera)) throw new Error('场景取景需要正交相机');
    const center = bounds.getCenter(new Vector3());
    camera.position.copy(center).add(new Vector3(...offset));
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    const { min, max } = bounds;
    const corners = [min.x, max.x].flatMap((x) => [min.y, max.y].flatMap((y) =>
      [min.z, max.z].map((z) => new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse))));
    const width = Math.max(...corners.map((p) => p.x)) - Math.min(...corners.map((p) => p.x));
    const height = Math.max(...corners.map((p) => p.y)) - Math.min(...corners.map((p) => p.y));
    camera.zoom = Math.min(size.width / (width * padding), size.height / (height * padding));
    camera.updateProjectionMatrix();
    invalidate();
  }, [bounds, camera, size.width, size.height, invalidate, offset[0], offset[1], offset[2], padding]);
  return null;
}
