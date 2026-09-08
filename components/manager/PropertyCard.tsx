"use client";
import Link from "next/link";
import { useDemoProperties } from "@/lib/mock/propertiesStore";
import Image from "next/image";
import { ArrowUpRight, DoorOpen } from "lucide-react";
import type { PropertySummary } from "@/types";
export default function PropertyCard({
  property: initialProperty,
  hrefBase = "/dashboard/manager/properties",
  showOrganization = false,
}: {
  property: PropertySummary;
  hrefBase?: string;
  showOrganization?: boolean;
}) {
  const properties = useDemoProperties();
  const property =
    properties.find((item) => item.id === initialProperty.id) ??
    initialProperty;
  const vacant = property.units.filter((u) => u.status === "vacant").length;
  return (
    <Link href={hrefBase + "/" + property.id} className="property-card">
      <div className="property-card-image">
        <Image
          src={
            property.propertyType === "student_accommodation"
              ? "/brand/residence.webp"
              : "/brand/courtyard.webp"
          }
          alt="Illustrative residential property exterior"
          fill
          sizes="(max-width:640px) 100vw, 33vw"
          className="object-cover"
        />
        <span>
          {property.propertyType === "student_accommodation"
            ? "Student living"
            : "Apartments"}{" "}
          · Demo property
        </span>
      </div>
      <div className="property-card-body">
        <h3>{property.name}</h3>
        <p>{property.address}</p>
        {showOrganization && <p>{property.organizationName}</p>}
        <div className="property-card-footer">
          <span>{property.units.length} units</span>
          <span>
            <DoorOpen size={13} />
            {vacant} vacant
          </span>
          <ArrowUpRight size={16} />
        </div>
      </div>
    </Link>
  );
}
