using System;

namespace NapoleonicRTS.Simulation
{
    public readonly struct Float2 : IEquatable<Float2>
    {
        public readonly float X;
        public readonly float Y;

        public Float2(float x, float y) { X = x; Y = y; }
        public static Float2 Zero => new Float2(0f, 0f);
        public float LengthSquared => X * X + Y * Y;
        public float Length => MathF.Sqrt(LengthSquared);

        public Float2 Normalized()
        {
            var length = Length;
            return length > 1e-6f ? this / length : Zero;
        }

        public static Float2 FromAngle(float radians) => new Float2(MathF.Cos(radians), MathF.Sin(radians));
        public static float Distance(Float2 a, Float2 b) => (a - b).Length;
        public static Float2 Lerp(Float2 a, Float2 b, float t) => a + (b - a) * Math.Clamp(t, 0f, 1f);

        public static Float2 MoveTowards(Float2 current, Float2 target, float maxDistance)
        {
            var delta = target - current;
            var distance = delta.Length;
            if (distance <= maxDistance || distance <= 1e-6f) return target;
            return current + delta * (maxDistance / distance);
        }

        public static Float2 operator +(Float2 a, Float2 b) => new Float2(a.X + b.X, a.Y + b.Y);
        public static Float2 operator -(Float2 a, Float2 b) => new Float2(a.X - b.X, a.Y - b.Y);
        public static Float2 operator *(Float2 a, float b) => new Float2(a.X * b, a.Y * b);
        public static Float2 operator /(Float2 a, float b) => new Float2(a.X / b, a.Y / b);
        public bool Equals(Float2 other) => X.Equals(other.X) && Y.Equals(other.Y);
        public override bool Equals(object obj) => obj is Float2 other && Equals(other);
        public override int GetHashCode() => HashCode.Combine(X, Y);
        public override string ToString() => $"({X:0.00}, {Y:0.00})";
    }
}
